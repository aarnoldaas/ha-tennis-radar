import { BASE } from './utils';

export type BrokerKey = 'swedbank' | 'interactive-brokers' | 'revolut' | 'wix';
export type AssetClass = 'equity' | 'etf' | 'bond' | 'cash' | 'crypto';
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

export interface UnresolvedAlias {
  broker: BrokerKey;
  rawSymbol: string;
  isin?: string;
  count: number;
  sampleTxId: string;
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

export interface Instrument {
  id: string;
  name: string;
  isin?: string;
  currency: string;
  assetClass: AssetClass;
  priceSource?: { provider: string; symbol: string };
  aliases: Record<string, string | string[]>;
}

export interface InstrumentDetail {
  instrument: Instrument;
  holding: MergedHolding | null;
  openLots: OpenLot[];
  transactions: Transaction[];
  realized: RealizedLotMatch[];
  income: IncomeRow[];
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  portfolio: () => fetch(`${BASE}/api/portfolio`).then(r => j<PortfolioSnapshot>(r)),
  refresh: () =>
    fetch(`${BASE}/api/portfolio/refresh`, { method: 'POST' }).then(r =>
      j<{ success: boolean; asOf: string }>(r),
    ),
  instrument: (id: string) =>
    fetch(`${BASE}/api/portfolio/instrument/${encodeURIComponent(id)}`).then(r =>
      j<InstrumentDetail>(r),
    ),
  listFiles: () =>
    fetch(`${BASE}/api/investments/files`).then(r => j<Record<string, string[]>>(r)),
  uploadFiles: async (broker: string, files: File[]) => {
    const formData = new FormData();
    for (const f of files) formData.append(broker, f, f.name);
    const res = await fetch(`${BASE}/api/investments/upload`, {
      method: 'POST',
      body: formData,
    });
    return j<{ success: boolean; uploaded?: string[]; error?: string }>(res);
  },
  deleteFile: async (broker: string, filename: string) => {
    const res = await fetch(
      `${BASE}/api/investments/files/${broker}/${encodeURIComponent(filename)}`,
      { method: 'DELETE' },
    );
    return j<{ success: boolean; error?: string }>(res);
  },
};
