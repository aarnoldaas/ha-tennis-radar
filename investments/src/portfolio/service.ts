import { statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  InstrumentDetail,
  PortfolioKpis,
  PortfolioSnapshot,
  Transaction,
} from '../parsers/types.js';
import { buildLedger } from './ledger.js';
import { buildLots, mergeLotsIntoHoldings } from './holdings.js';
import { buildCash, buildIncome } from './income.js';
import { buildAllocation } from './allocation.js';
import { FxService } from '../market/fx.js';
import { PriceService } from '../market/prices.js';
import { allInstruments, getInstrument } from '../config/instruments.js';

/**
 * Portfolio service. The only object the HTTP layer talks to.
 *
 * Caching strategy: we keep one in-memory snapshot. It is recomputed on
 * demand when:
 *   (a) mtime of any file under `/data/Investments/` changes, or
 *   (b) price/FX cache is stale, or
 *   (c) a caller explicitly requests a refresh.
 *
 * Everything downstream is a pure function of the ledger + market data, so
 * the snapshot is idempotent given the same inputs.
 */
export class PortfolioService {
  private readonly dataDir: string;
  private readonly fx: FxService;
  private readonly prices: PriceService;
  private cached: {
    snapshot: PortfolioSnapshot;
    transactions: Transaction[];
    lotsFingerprint: string;
    filesFingerprint: string;
  } | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.fx = new FxService(dataDir);
    this.prices = new PriceService(dataDir);
  }

  private filesFingerprint(): string {
    try {
      const { readdirSync } = require('node:fs') as typeof import('node:fs');
      const root = join(this.dataDir, 'Investments');
      const parts: string[] = [];
      for (const broker of readdirSync(root, { withFileTypes: true })) {
        if (!broker.isDirectory()) continue;
        const brokerDir = join(root, broker.name);
        for (const f of readdirSync(brokerDir)) {
          try {
            const s = statSync(join(brokerDir, f));
            parts.push(`${broker.name}/${f}:${s.size}:${s.mtimeMs}`);
          } catch {
            /* ignore */
          }
        }
      }
      parts.sort();
      return parts.join('|');
    } catch {
      return '';
    }
  }

  async getSnapshot(force = false): Promise<PortfolioSnapshot> {
    const fp = this.filesFingerprint();
    if (!force && this.cached && this.cached.filesFingerprint === fp) {
      return this.cached.snapshot;
    }

    await this.fx.refresh();
    const ledger = buildLedger(this.dataDir);
    const { openLots, realized } = buildLots(ledger.transactions, this.fx);
    const holdings = mergeLotsIntoHoldings(openLots);

    const sources = holdings
      .map(h => {
        const inst = getInstrument(h.instrumentId);
        return inst?.priceSource ?? null;
      })
      .filter((s): s is NonNullable<typeof s> => !!s);
    const quoteMap = await this.prices.getMany(sources);

    for (const h of holdings) {
      const inst = getInstrument(h.instrumentId);
      if (!inst?.priceSource) continue;
      const quote = quoteMap.get(`${inst.priceSource.provider}:${inst.priceSource.symbol}`);
      if (!quote?.price || !quote.currency) continue;
      h.marketPrice = quote.price;
      const mvNative = quote.price * h.quantity;
      h.marketValueBase = this.fx.toBaseLatest(mvNative, quote.currency);
      h.unrealizedPnlBase = h.marketValueBase - h.costBasisBase;
      h.unrealizedPnlPct = h.costBasisBase > 0 ? h.unrealizedPnlBase / h.costBasisBase : 0;
    }

    const income = buildIncome(ledger.transactions, this.fx);
    const cash = buildCash(ledger.transactions, this.fx);
    const allocation = buildAllocation(holdings, cash);

    const kpis = computeKpis(holdings, cash, income, realized);

    const snapshot: PortfolioSnapshot = {
      asOf: new Date().toISOString(),
      baseCurrency: 'EUR',
      kpis,
      holdings,
      realized: realized.sort((a, b) => b.soldAt.localeCompare(a.soldAt)),
      income,
      cash,
      allocation,
      unresolved: ledger.unresolved,
    };

    this.cached = {
      snapshot,
      transactions: ledger.transactions,
      lotsFingerprint: String(openLots.length),
      filesFingerprint: fp,
    };
    return snapshot;
  }

  async getInstrumentDetail(id: string): Promise<InstrumentDetail | null> {
    const inst = getInstrument(id);
    if (!inst) return null;
    const snap = await this.getSnapshot();
    const ledger = this.cached?.transactions ?? [];
    const txs = ledger.filter(t => t.instrumentId === id);
    const { openLots } = buildLots(ledger, this.fx);
    const holding = snap.holdings.find(h => h.instrumentId === id) ?? null;
    const realized = snap.realized.filter(r => r.instrumentId === id);
    const income = snap.income.filter(i => i.instrumentId === id);
    return {
      instrument: inst,
      holding,
      openLots: openLots.filter(l => l.instrumentId === id),
      transactions: txs,
      realized,
      income,
    };
  }

  listInstruments() {
    return allInstruments();
  }
}

function computeKpis(
  holdings: PortfolioSnapshot['holdings'],
  cash: PortfolioSnapshot['cash'],
  income: PortfolioSnapshot['income'],
  realized: PortfolioSnapshot['realized'],
): PortfolioKpis {
  const holdingsValue = holdings.reduce(
    (s, h) => s + (h.marketValueBase ?? h.costBasisBase),
    0,
  );
  const invested = holdings.reduce((s, h) => s + h.costBasisBase, 0);
  const unrealized = holdings.reduce(
    (s, h) => s + (h.unrealizedPnlBase ?? 0),
    0,
  );
  const totalCash = cash.reduce((s, c) => s + Math.max(0, c.amountBase), 0);
  const year = new Date().getUTCFullYear();
  const realizedYtd = realized
    .filter(r => r.soldAt.startsWith(String(year)))
    .reduce((s, r) => s + r.realizedPnlBase, 0);
  const dividendsYtd = income
    .filter(i => i.kind === 'dividend' && i.year === year)
    .reduce((s, i) => s + i.netBase, 0);

  return {
    totalValueBase: holdingsValue + totalCash,
    invested,
    unrealizedPnlBase: unrealized,
    unrealizedPnlPct: invested > 0 ? unrealized / invested : 0,
    realizedYtdBase: realizedYtd,
    dividendsYtdBase: dividendsYtd,
    totalCashBase: totalCash,
    baseCurrency: 'EUR',
  };
}
