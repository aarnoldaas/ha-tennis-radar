import { BASE } from './utils';

export type BrokerKey = 'swedbank' | 'interactive-brokers';
export type AssetClass = 'equity' | 'etf' | 'bond' | 'cash' | 'crypto';
export type TxKind =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'interest'
  | 'tax'
  | 'deposit'
  | 'withdrawal';

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

export interface TradeSummary {
  timestamp: string;
  broker: BrokerKey;
  quantity: number;
  price: number;
  currency: string;
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
  lastBuy: TradeSummary | null;
  lastSell: TradeSummary | null;
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

export interface AllocationSlice {
  key: string;
  label: string;
  valueBase: number;
  pct: number;
}

export interface Allocation {
  byAssetClass: AllocationSlice[];
  byCurrency: AllocationSlice[];
}

export interface PortfolioKpis {
  totalValueBase: number;
  invested: number;
  unrealizedPnlBase: number;
  unrealizedPnlPct: number;
  realizedYtdBase: number;
  dividendsYtdBase: number;
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

export interface ResolvedMappingEntry {
  instrumentId: string;
  name: string;
  isin?: string;
  currency: string;
  assetClass: AssetClass;
  yahooSymbol: string | null;
  priceProvider: string | null;
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

export interface DataFileEntry {
  path: string;
  size: number;
  mtime: number;
}

export interface DataFilesPayload {
  root: string;
  files: DataFileEntry[];
}

export interface WatchlistItem {
  id: string;
  finnhubSymbol: string;
  yahooSymbol: string | null;
  displayName: string | null;
  notes: string | null;
  addedAt: string;
}

export interface ResearchRow {
  id: string;
  kind: 'holding' | 'watchlist' | 'both';
  finnhubSymbol: string | null;
  yahooSymbol: string | null;
  displayName: string;
  currency: string | null;
  sector: string | null;
  country: string | null;
  quantity: number | null;
  marketValueBase: number | null;
  unrealizedPnlPct: number | null;
  price: number | null;
  priceCurrency: string | null;
  dayChangePct: number | null;
  quote: {
    price: number;
    dayChange: number;
    dayChangePct: number;
    prevClose: number;
    asOf: number;
  } | null;
  metric: {
    peTTM: number | null;
    peForward: number | null;
    epsTTM: number | null;
    beta: number | null;
    marketCap: number | null;
    week52High: number | null;
    week52Low: number | null;
    dividendYieldAnnual: number | null;
    payoutRatio: number | null;
    revenueGrowthTTMYoy: number | null;
    revenueGrowth5Y: number | null;
    revenueGrowthQuarterlyYoy: number | null;
    epsGrowthTTMYoy: number | null;
    epsGrowthQuarterlyYoy: number | null;
  } | null;
  profile: {
    name: string | null;
    ticker: string | null;
    exchange: string | null;
    country: string | null;
    currency: string | null;
    industry: string | null;
    ipo: string | null;
    logo: string | null;
    weburl: string | null;
    marketCap: number | null;
    shareOutstanding: number | null;
  } | null;
  nextEarnings: {
    symbol: string;
    date: string;
    epsEstimate: number | null;
    epsActual: number | null;
    revenueEstimate: number | null;
    revenueActual: number | null;
    hour: string | null;
    quarter: number | null;
    year: number | null;
  } | null;
  nextExDividend: {
    symbol: string;
    date: string;
    amount: number;
    currency: string | null;
    payDate: string | null;
    recordDate: string | null;
    declarationDate: string | null;
  } | null;
  notes: string | null;
  watchlistId: string | null;
  fundamentalsSource: 'finnhub' | 'yahoo' | 'mixed' | 'none' | 'disabled';
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
  enabled: boolean;
  reason: string | null;
  rows: ResearchRow[];
  upcoming: UpcomingEvent[];
}

export interface FinnhubSearchHit {
  symbol: string;
  description: string;
  type: string | null;
  displaySymbol: string | null;
}

export interface YahooVerifyResponse {
  ok: boolean;
  price?: number;
  currency?: string;
  symbol?: string;
  exchangeName?: string | null;
  shortName?: string | null;
  longName?: string | null;
  error?: string;
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
  transactions: () =>
    fetch(`${BASE}/api/portfolio/transactions`).then(r => j<Transaction[]>(r)),
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
  mappings: () =>
    fetch(`${BASE}/api/instruments/mappings`).then(r => j<MappingsPayload>(r)),
  verifyYahoo: async (symbol: string) => {
    const res = await fetch(`${BASE}/api/instruments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    // Errors come back as 4xx/5xx with a structured body — surface them
    // instead of throwing so the UI can render the message inline.
    return (await res.json()) as YahooVerifyResponse;
  },
  saveResolvedMapping: async (instrumentId: string, yahooSymbol: string | null) => {
    const res = await fetch(`${BASE}/api/instruments/mappings/resolved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instrumentId, yahooSymbol }),
    });
    return (await res.json()) as { ok: boolean; error?: string; instrument?: Instrument };
  },
  listDataFiles: () =>
    fetch(`${BASE}/api/data/files`).then(r => j<DataFilesPayload>(r)),
  dataFileUrl: (path: string) =>
    `${BASE}/api/data/file?path=${encodeURIComponent(path)}`,
  deleteDataFile: async (path: string) => {
    const res = await fetch(
      `${BASE}/api/data/file?path=${encodeURIComponent(path)}`,
      { method: 'DELETE' },
    );
    return j<{ success: boolean; error?: string }>(res);
  },
  uploadDataFiles: async (dir: string, files: File[]) => {
    const formData = new FormData();
    for (const f of files) formData.append('file', f, f.name);
    const res = await fetch(
      `${BASE}/api/data/upload?dir=${encodeURIComponent(dir)}`,
      { method: 'POST', body: formData },
    );
    return j<{ success: boolean; uploaded?: string[]; error?: string }>(res);
  },
  research: () => fetch(`${BASE}/api/research`).then(r => j<ResearchPayload>(r)),
  refreshResearch: () =>
    fetch(`${BASE}/api/research/refresh`, { method: 'POST' }).then(r =>
      j<{ ok: boolean; asOf: string }>(r),
    ),
  searchSymbol: async (q: string) => {
    const res = await fetch(
      `${BASE}/api/research/search?q=${encodeURIComponent(q)}`,
    );
    return (await res.json()) as { ok: boolean; enabled?: boolean; hits: FinnhubSearchHit[] };
  },
  listWatchlist: () =>
    fetch(`${BASE}/api/watchlist`).then(r => j<{ items: WatchlistItem[] }>(r)),
  addWatchlist: async (input: {
    finnhubSymbol: string;
    yahooSymbol?: string | null;
    displayName?: string | null;
    notes?: string | null;
  }) => {
    const res = await fetch(`${BASE}/api/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return (await res.json()) as { ok: boolean; error?: string; item?: WatchlistItem };
  },
  updateWatchlist: async (
    id: string,
    patch: {
      finnhubSymbol?: string;
      yahooSymbol?: string | null;
      displayName?: string | null;
      notes?: string | null;
    },
  ) => {
    const res = await fetch(`${BASE}/api/watchlist/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return (await res.json()) as { ok: boolean; error?: string; item?: WatchlistItem };
  },
  removeWatchlist: async (id: string) => {
    const res = await fetch(`${BASE}/api/watchlist/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return (await res.json()) as { ok: boolean; error?: string };
  },
  saveUnresolvedMapping: async (
    broker: BrokerKey,
    rawSymbol: string,
    yahooSymbol: string,
    overrides?: { name?: string; currency?: string },
  ) => {
    const res = await fetch(`${BASE}/api/instruments/mappings/unresolved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broker, rawSymbol, yahooSymbol, ...overrides }),
    });
    return (await res.json()) as {
      ok: boolean;
      error?: string;
      instrument?: Instrument;
      verified?: YahooVerifyResponse | null;
    };
  },
};
