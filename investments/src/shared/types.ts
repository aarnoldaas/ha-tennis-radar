/**
 * The single source of truth for every data shape in the addon.
 * Imported by BOTH the backend and the frontend — no hand-duplicated types.
 *
 * Conventions:
 *   - Every EUR-denominated field ends in `Eur`. Native-currency values are
 *     display-only (`priceNative` + `currency`).
 *   - `amountEur` is the signed EUR cash effect on the brokerage account:
 *     positive = money in (sell, dividend, interest, deposit), negative =
 *     money out (buy, fee, withdrawal). No per-kind exceptions.
 *   - `Instrument.symbol` is THE display symbol used everywhere in the UI.
 *   - There is no `tax` transaction type: withholding is folded into the
 *     paying dividend/interest transaction as `grossEur` / `taxEur`.
 */

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/** Broker keys double as directory names under `/data/Investments/`. */
export type Broker = 'swedbank' | 'interactive-brokers';

export type AssetClass = 'equity' | 'etf' | 'bond' | 'crypto';

export type TxType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'interest'
  | 'fee'
  | 'deposit'
  | 'withdrawal';

/** Entry in the curated instrument master (`instruments.yaml`). */
export interface Instrument {
  /** Stable slug, e.g. `apranga`. Never changes once assigned. */
  id: string;
  /** THE display symbol, e.g. `APG1L`. Used everywhere in the UI. */
  symbol: string;
  name: string;
  isin: string | null;
  /** Native listing currency — display only, all math is EUR. */
  currency: string;
  assetClass: AssetClass;
  /** Yahoo Finance ticker for prices + fundamentals. Null = unpriced. */
  yahooSymbol: string | null;
  /** Broker-native symbols that resolve to this instrument. */
  aliases: Partial<Record<Broker, string[]>>;
}

/** One row of the normalized ledger. Fully resolved, EUR-final. */
export interface Transaction {
  id: string;
  broker: Broker;
  /** YYYY-MM-DD */
  date: string;
  type: TxType;
  /** Null = cash-level row (deposit/withdrawal/interest) or unmapped symbol. */
  instrumentId: string | null;
  /** Display symbol from the instrument master; broker symbol when unmapped. */
  symbol: string | null;
  /** Signed: positive = shares in, negative = shares out. Trades only. */
  quantity: number | null;
  /** Per-unit price in `currency` — display only. Trades only. */
  priceNative: number | null;
  /** Native currency of the row. */
  currency: string;
  /** Signed EUR cash effect (+in / −out) — THE number. Net of withholding. */
  amountEur: number;
  /** Dividend/interest only: gross amount before withholding. */
  grossEur: number | null;
  /** Dividend/interest only: withholding tax, positive number. */
  taxEur: number | null;
  note: string | null;
  sourceFile: string;
}

/** Broker symbol seen in the files but missing from the instrument master. */
export interface UnmappedSymbol {
  broker: Broker;
  rawSymbol: string;
  isin: string | null;
  count: number;
}

// ---------------------------------------------------------------------------
// Derived portfolio entities
// ---------------------------------------------------------------------------

/** Compact summary of the most recent buy/sell for the Holdings table. */
export interface TradeRef {
  date: string;
  broker: Broker;
  quantity: number;
  priceNative: number;
  currency: string;
}

/** One open position, fully priced at construction — never half-populated. */
export interface Holding {
  instrumentId: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** Native listing currency — display only. */
  currency: string;
  quantity: number;
  /** Remaining FIFO cost basis. */
  costEur: number;
  avgCostEur: number;
  /** True when a live quote was applied to value the position. */
  priced: boolean;
  /** Latest quote in native currency — display only. */
  priceNative: number | null;
  priceAsOf: string | null;
  /** Market value; equals costEur when !priced. */
  valueEur: number;
  /** valueEur − costEur; 0 when !priced. */
  gainEur: number;
  gainPct: number;
  lastBuy: TradeRef | null;
  lastSell: TradeRef | null;
}

/** Open FIFO lot (instrument detail view). */
export interface Lot {
  instrumentId: string;
  broker: Broker;
  date: string;
  quantity: number;
  costEur: number;
  /** Original per-unit purchase price — display only. */
  priceNative: number;
  currency: string;
}

/** Realized FIFO match: one buy-lot slice closed by one sell. */
export interface Sale {
  instrumentId: string;
  symbol: string;
  broker: Broker;
  buyDate: string;
  sellDate: string;
  quantity: number;
  proceedsEur: number;
  costEur: number;
  gainEur: number;
  holdingDays: number;
}

/** Income aggregate per (instrument, broker, year, type). */
export interface IncomeRow {
  year: number;
  type: 'dividend' | 'interest';
  /** Null = account-level income (interest) or unmapped dividend. */
  instrumentId: string | null;
  /** Null only for account-level interest — UI labels it "Interest". */
  symbol: string | null;
  broker: Broker;
  grossEur: number;
  taxEur: number;
  netEur: number;
}

export interface AllocationSlice {
  label: string;
  valueEur: number;
  pct: number;
}

/** The one payload the portfolio tabs read. */
export interface Portfolio {
  asOf: string;
  totals: {
    valueEur: number;
    costEur: number;
    gainEur: number;
    gainPct: number;
    realizedYtdEur: number;
    incomeYtdEur: number;
    /** Lifetime external cash in/out — powers the Cashflow KPIs. */
    depositsEur: number;
    withdrawalsEur: number;
  };
  holdings: Holding[];
  income: IncomeRow[];
  sales: Sale[];
  allocation: {
    assetClass: AllocationSlice[];
    currency: AllocationSlice[];
  };
  unmapped: UnmappedSymbol[];
}

export interface InstrumentDetail {
  instrument: Instrument;
  holding: Holding | null;
  lots: Lot[];
  transactions: Transaction[];
  sales: Sale[];
  income: IncomeRow[];
}

// ---------------------------------------------------------------------------
// Watchlist + research
// ---------------------------------------------------------------------------

export interface WatchlistItem {
  id: string;
  /** Yahoo Finance symbol — the canonical key. */
  symbol: string;
  displayName: string | null;
  notes: string | null;
  addedAt: string;
}

export type ResearchRowKind = 'holding' | 'watchlist' | 'both';

export interface InstrumentMetrics {
  peTTM: number | null;
  peForward: number | null;
  epsTTM: number | null;
  beta: number | null;
  marketCap: number | null;
  week52High: number | null;
  week52Low: number | null;
  /** Annualised dividend yield as a fraction (0.025 = 2.5%). */
  dividendYieldAnnual: number | null;
  payoutRatio: number | null;
  /** Most-recent-quarter YoY revenue growth as a fraction. */
  revenueGrowthYoy: number | null;
  /** Most-recent-quarter YoY earnings growth as a fraction. */
  earningsGrowthYoy: number | null;
}

export interface InstrumentProfile {
  name: string | null;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  weburl: string | null;
  sharesOutstanding: number | null;
}

export interface EarningsEvent {
  date: string;
  epsEstimate: number | null;
}

export interface DividendEvent {
  /** Ex-dividend date. */
  date: string;
  amount: number;
  currency: string | null;
  payDate: string | null;
}

export interface ResearchRow {
  /** Stable id: `holding:<instrumentId>` or `watch:<watchlistId>`. */
  id: string;
  kind: ResearchRowKind;
  /** Yahoo-format symbol — the single key for upstream lookups. */
  symbol: string | null;
  displayName: string;
  currency: string | null;
  sector: string | null;
  country: string | null;
  /** Holdings-only: quantity owned. */
  quantity: number | null;
  /** Holdings-only: market value in EUR. */
  valueEur: number | null;
  /** Holdings-only: unrealized gain %. */
  gainPct: number | null;
  /** Latest price in `priceCurrency`. */
  price: number | null;
  priceCurrency: string | null;
  dayChangePct: number | null;
  metrics: InstrumentMetrics | null;
  profile: InstrumentProfile | null;
  nextEarnings: EarningsEvent | null;
  nextExDividend: DividendEvent | null;
  /** Watchlist-only: free-text annotation. */
  notes: string | null;
  /** Watchlist-only: id of the watchlist row (so DELETE knows the target). */
  watchlistId: string | null;
}

export interface UpcomingEvent {
  rowId: string;
  symbol: string;
  displayName: string;
  date: string;
  daysUntil: number;
  kind: 'earnings' | 'ex-dividend';
  detail: string | null;
}

export interface ResearchPayload {
  asOf: string;
  rows: ResearchRow[];
  upcoming: UpcomingEvent[];
}

// ---------------------------------------------------------------------------
// Files + misc API payloads
// ---------------------------------------------------------------------------

export interface DataFileEntry {
  /** Path relative to the data dir, `/`-separated. */
  path: string;
  size: number;
  mtime: number;
}

export interface DataFilesPayload {
  files: DataFileEntry[];
}

export interface YahooVerifyResult {
  ok: boolean;
  price?: number;
  currency?: string;
  symbol?: string;
  exchangeName?: string | null;
  shortName?: string | null;
  longName?: string | null;
  error?: string;
}
