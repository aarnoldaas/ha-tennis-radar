import { statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BrokerKey,
  InstrumentDetail,
  PortfolioKpis,
  PortfolioSnapshot,
  Transaction,
} from '../parsers/types.js';
import { buildLedger } from './ledger.js';
import { buildLots, mergeLotsIntoHoldings } from './holdings.js';
import { buildIncome } from './income.js';
import { buildAllocation } from './allocation.js';
import { FxService } from '../market/fx.js';
import { PriceService } from '../market/prices.js';
import {
  allInstruments,
  getInstrument,
  instrumentsMtime,
  setInstrumentsPath,
} from '../config/instruments.js';

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
    setInstrumentsPath(join(dataDir, 'instruments.yaml'));
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
      // Mappings tab edits the instruments YAML at runtime; baking its mtime
      // into the fingerprint ensures the next snapshot fetch reparses and
      // reprices instead of returning the stale cached snapshot.
      parts.push(`__instruments__:${instrumentsMtime()}`);
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
    const holdings = mergeLotsIntoHoldings(openLots, ledger.transactions);

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
    const allocation = buildAllocation(holdings);

    const kpis = computeKpis(holdings, income, realized);

    const snapshot: PortfolioSnapshot = {
      asOf: new Date().toISOString(),
      baseCurrency: 'EUR',
      kpis,
      holdings,
      realized: realized.sort((a, b) => b.soldAt.localeCompare(a.soldAt)),
      income,
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

  /**
   * Return the canonical ledger (with `instrumentId` resolved where possible).
   * Used by the Transactions tab to browse every parsed row across all
   * brokers in one place. Sorted newest-first to match the UI's reading
   * order; the cache is rebuilt on demand if the source files change.
   */
  async getTransactions(): Promise<Transaction[]> {
    await this.getSnapshot();
    const ledger = this.cached?.transactions ?? [];
    return [...ledger].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  listInstruments() {
    return allInstruments();
  }

  async getMappings(): Promise<MappingsPayload> {
    const snap = await this.getSnapshot();
    const all = allInstruments();
    const holdingById = new Map(snap.holdings.map(h => [h.instrumentId, h]));

    const resolved: ResolvedMappingEntry[] = all.map(inst => {
      const h = holdingById.get(inst.id) ?? null;
      const aliases: { broker: BrokerKey; rawSymbol: string }[] = [];
      for (const [broker, raw] of Object.entries(inst.aliases ?? {})) {
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        for (const sym of list) aliases.push({ broker: broker as BrokerKey, rawSymbol: sym });
      }
      const ps = inst.priceSource ?? null;
      return {
        instrumentId: inst.id,
        name: inst.name,
        isin: inst.isin,
        currency: inst.currency,
        assetClass: inst.assetClass,
        yahooSymbol: ps && ps.provider === 'yahoo' ? ps.symbol : null,
        priceProvider: ps ? ps.provider : null,
        priceSymbol: ps ? ps.symbol : null,
        aliases,
        marketPrice: h?.marketPrice ?? null,
        marketValueBase: h?.marketValueBase ?? null,
        quantity: h?.quantity ?? 0,
        hasOpenPosition: !!h && h.quantity > 0,
      };
    });

    resolved.sort((a, b) => {
      // Open positions first, then by name.
      if (a.hasOpenPosition !== b.hasOpenPosition) return a.hasOpenPosition ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      resolved,
      unresolved: snap.unresolved.map(u => ({
        broker: u.broker,
        rawSymbol: u.rawSymbol,
        isin: u.isin,
        count: u.count,
      })),
    };
  }
}

export interface ResolvedMappingEntry {
  instrumentId: string;
  name: string;
  isin?: string;
  currency: string;
  assetClass: string;
  /** Yahoo ticker if the priceSource is Yahoo, else null. */
  yahooSymbol: string | null;
  /** Raw provider name when not Yahoo (e.g. 'stooq', 'manual'); null if no priceSource. */
  priceProvider: string | null;
  /** Raw symbol regardless of provider — useful for non-Yahoo providers. */
  priceSymbol: string | null;
  aliases: { broker: BrokerKey; rawSymbol: string }[];
  marketPrice: number | null;
  marketValueBase: number | null;
  quantity: number;
  hasOpenPosition: boolean;
}

export interface UnresolvedMappingEntry {
  broker: BrokerKey;
  rawSymbol: string;
  isin?: string;
  count: number;
}

export interface MappingsPayload {
  resolved: ResolvedMappingEntry[];
  unresolved: UnresolvedMappingEntry[];
}

function computeKpis(
  holdings: PortfolioSnapshot['holdings'],
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
  const year = new Date().getUTCFullYear();
  const realizedYtd = realized
    .filter(r => r.soldAt.startsWith(String(year)))
    .reduce((s, r) => s + r.realizedPnlBase, 0);
  const dividendsYtd = income
    .filter(i => i.kind === 'dividend' && i.year === year)
    .reduce((s, i) => s + i.netBase, 0);

  return {
    totalValueBase: holdingsValue,
    invested,
    unrealizedPnlBase: unrealized,
    unrealizedPnlPct: invested > 0 ? unrealized / invested : 0,
    realizedYtdBase: realizedYtd,
    dividendsYtdBase: dividendsYtd,
    baseCurrency: 'EUR',
  };
}
