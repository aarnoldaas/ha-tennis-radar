export type BrokerKey = 'swedbank' | 'interactive-brokers' | 'revolut' | 'wix';

export const BROKER_KEYS: BrokerKey[] = [
  'swedbank',
  'interactive-brokers',
  'revolut',
  'wix',
];

export const BROKER_LABELS: Record<BrokerKey, string> = {
  swedbank: 'Swedbank',
  'interactive-brokers': 'Interactive Brokers',
  revolut: 'Revolut',
  wix: 'Wix',
};

export type TxKind =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'interest'
  | 'tax'
  | 'fee'
  | 'deposit'
  | 'withdrawal'
  | 'fx'
  | 'internal';

export type AssetClass = 'equity' | 'etf' | 'bond' | 'cash' | 'crypto';

/**
 * Canonical transaction: the atomic unit of the ledger. All broker parsers
 * emit these; all views are derived from them.
 *
 * - `amount` is the signed net cash effect in `currency` (positive = cash in).
 * - For `buy`/`sell`, `quantity` is signed (positive = shares in, negative =
 *   shares out). `price` is per-unit in `currency`.
 * - `instrumentId` is resolved via the curated instrument master. `null`
 *   means the row needs curation.
 */
export interface Transaction {
  id: string;
  broker: BrokerKey;
  sourceFile: string;
  timestamp: string;
  kind: TxKind;
  instrumentId: string | null;
  rawSymbol: string | null;
  isin?: string;
  quantity?: number;
  price?: number;
  amount: number;
  currency: string;
  notes?: string;
}

/** Unresolved (broker, symbol) pair surfaced to the UI for manual curation. */
export interface UnresolvedAlias {
  broker: BrokerKey;
  rawSymbol: string;
  isin?: string;
  count: number;
  sampleTxId: string;
}

/** Price source hint used by market/prices.ts */
export interface PriceSource {
  provider: 'yahoo' | 'stooq' | 'manual';
  symbol: string;
}

/** Entry in the curated instrument master (instruments.yaml). */
export interface Instrument {
  id: string;
  name: string;
  isin?: string;
  currency: string;
  assetClass: AssetClass;
  priceSource?: PriceSource;
  aliases: Partial<Record<BrokerKey, string | string[]>>;
}

export interface OpenLot {
  instrumentId: string;
  broker: BrokerKey;
  acquiredAt: string;
  quantity: number;
  costPerUnit: number;
  costCurrency: string;
  fxToBase?: number;
  costPerUnitBase: number;
  sourceTxId: string;
}

export interface BrokerHolding {
  broker: BrokerKey;
  quantity: number;
  avgCost: number;
  avgCostBase: number;
  costBasisBase: number;
}

export interface MergedHolding {
  instrumentId: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  currency: string;
  quantity: number;
  avgCost: number;
  avgCostBase: number;
  costBasisBase: number;
  marketPrice: number | null;
  marketValueBase: number | null;
  unrealizedPnlBase: number | null;
  unrealizedPnlPct: number | null;
  perBroker: BrokerHolding[];
}

export interface RealizedLotMatch {
  instrumentId: string;
  symbol: string;
  broker: BrokerKey;
  acquiredAt: string;
  soldAt: string;
  quantity: number;
  proceedsBase: number;
  costBasisBase: number;
  realizedPnlBase: number;
  holdingDays: number;
  currency: string;
}

export interface IncomeRow {
  instrumentId: string | null;
  symbol: string;
  broker: BrokerKey;
  year: number;
  grossBase: number;
  taxBase: number;
  netBase: number;
  currency: string;
  kind: 'dividend' | 'interest';
}

export interface CashBalance {
  broker: BrokerKey;
  currency: string;
  amount: number;
  amountBase: number;
}

export interface AllocationSlice {
  key: string;
  label: string;
  valueBase: number;
  pct: number;
}

export interface Allocation {
  byAssetClass: AllocationSlice[];
  byCurrency: AllocationSlice[];
  byBroker: AllocationSlice[];
}

export interface PortfolioKpis {
  totalValueBase: number;
  invested: number;
  unrealizedPnlBase: number;
  unrealizedPnlPct: number;
  realizedYtdBase: number;
  dividendsYtdBase: number;
  totalCashBase: number;
  baseCurrency: string;
}

export interface PortfolioSnapshot {
  asOf: string;
  baseCurrency: string;
  kpis: PortfolioKpis;
  holdings: MergedHolding[];
  realized: RealizedLotMatch[];
  income: IncomeRow[];
  cash: CashBalance[];
  allocation: Allocation;
  unresolved: UnresolvedAlias[];
}

export interface InstrumentDetail {
  instrument: Instrument;
  holding: MergedHolding | null;
  openLots: OpenLot[];
  transactions: Transaction[];
  realized: RealizedLotMatch[];
  income: IncomeRow[];
}
