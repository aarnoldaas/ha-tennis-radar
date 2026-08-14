import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  InstrumentDetail,
  Lot,
  Portfolio,
  Sale,
  Transaction,
} from '../shared/types';
import { InstrumentStore } from './instruments';
import {
  buildHoldings,
  buildIncome,
  buildLots,
  buildPortfolio,
  loadRaw,
  normalize,
  type InstrumentQuote,
} from './pipeline';
import { FxService } from '../market/fx';
import { PriceService } from '../market/prices';

/**
 * Portfolio service — the only object the HTTP layer talks to for portfolio
 * data. Holds one in-memory result, recomputed when the file fingerprint
 * (broker CSVs + instruments.yaml) changes or a caller forces a refresh.
 * Everything downstream is a pure function of the ledger + market data.
 */
export class PortfolioService {
  readonly instruments: InstrumentStore;
  readonly prices: PriceService;
  private readonly dataDir: string;
  private readonly fx: FxService;
  private cached: {
    fingerprint: string;
    portfolio: Portfolio;
    transactions: Transaction[];
    lots: Lot[];
    sales: Sale[];
  } | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.fx = new FxService(dataDir);
    this.prices = new PriceService(dataDir);
    this.instruments = new InstrumentStore(join(dataDir, 'instruments.yaml'));
  }

  private fingerprint(): string {
    const parts: string[] = [];
    try {
      const root = join(this.dataDir, 'Investments');
      if (existsSync(root)) {
        for (const broker of readdirSync(root, { withFileTypes: true })) {
          if (!broker.isDirectory()) continue;
          const brokerDir = join(root, broker.name);
          for (const name of readdirSync(brokerDir)) {
            try {
              const s = statSync(join(brokerDir, name));
              parts.push(`${broker.name}/${name}:${s.size}:${s.mtimeMs}`);
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
    parts.sort();
    // The Instruments tab rewrites the YAML at runtime; its mtime in the
    // fingerprint makes the next fetch reparse instead of serving stale data.
    parts.push(`__instruments__:${this.instruments.mtime()}`);
    return parts.join('|');
  }

  async getPortfolio(force = false): Promise<Portfolio> {
    const fingerprint = this.fingerprint();
    if (!force && this.cached && this.cached.fingerprint === fingerprint) {
      return this.cached.portfolio;
    }

    this.instruments.reload();
    await this.fx.refresh();

    const raw = loadRaw(this.dataDir);
    const { transactions, unmapped } = normalize(raw, this.instruments, this.fx);
    const { lots, sales } = buildLots(transactions);

    const quotes = await this.fetchQuotes(lots);
    const holdings = buildHoldings(lots, transactions, this.instruments, quotes, this.fx);
    const income = buildIncome(transactions);

    const portfolio = buildPortfolio({
      asOf: new Date().toISOString(),
      transactions,
      holdings,
      income,
      sales,
      unmapped,
    });

    // Reload the fingerprint in case the instruments migration rewrote the
    // YAML during reload() — otherwise the very next call would rebuild again.
    this.cached = {
      fingerprint: this.fingerprint(),
      portfolio,
      transactions,
      lots,
      sales,
    };
    return portfolio;
  }

  private async fetchQuotes(lots: Lot[]): Promise<Map<string, InstrumentQuote>> {
    const symbolById = new Map<string, string>();
    for (const lot of lots) {
      if (symbolById.has(lot.instrumentId)) continue;
      const yahooSymbol = this.instruments.get(lot.instrumentId)?.yahooSymbol;
      if (yahooSymbol) symbolById.set(lot.instrumentId, yahooSymbol);
    }
    const quotesBySymbol = await this.prices.getMany([...new Set(symbolById.values())]);
    const out = new Map<string, InstrumentQuote>();
    for (const [instrumentId, symbol] of symbolById) {
      const quote = quotesBySymbol.get(symbol.toUpperCase());
      if (quote) out.set(instrumentId, quote);
    }
    return out;
  }

  async getTransactions(): Promise<Transaction[]> {
    await this.getPortfolio();
    return [...(this.cached?.transactions ?? [])].sort(
      (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
    );
  }

  async getInstrumentDetail(id: string): Promise<InstrumentDetail | null> {
    const instrument = this.instruments.get(id);
    if (!instrument) return null;
    const portfolio = await this.getPortfolio();
    const cached = this.cached!;
    return {
      instrument,
      holding: portfolio.holdings.find(h => h.instrumentId === id) ?? null,
      lots: cached.lots.filter(l => l.instrumentId === id),
      transactions: cached.transactions
        .filter(t => t.instrumentId === id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
      sales: portfolio.sales.filter(s => s.instrumentId === id),
      income: portfolio.income.filter(i => i.instrumentId === id),
    };
  }

  /** Invalidate the in-memory result (after instrument mutations). */
  invalidate(): void {
    this.cached = null;
  }
}
