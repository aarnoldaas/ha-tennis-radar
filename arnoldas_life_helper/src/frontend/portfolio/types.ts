// Unified trade record from any broker
export interface NormalizedTrade {
  date: string;          // YYYY-MM-DD
  symbol: string;        // Normalized ticker
  description: string;   // Company name
  side: 'BUY' | 'SELL';
  quantity: number;      // Always positive
  price: number;         // Per-share in original currency
  currency: string;      // EUR, USD, DKK, CNH
  fxRateToEUR: number;
  totalEUR: number;      // Total cost/proceeds in EUR
  commission: number;    // In EUR
  taxes: number;         // In EUR
  broker: 'IB' | 'Swedbank' | 'WIX' | 'Revolut';
  assetClass: 'STK' | 'ETF' | 'CRYPTO' | 'ESPP' | 'RSU';
  country: string;       // ISO 2-letter
  isin?: string;
  notes?: string;
  rawSourceId?: string;
}

// Unified dividend record
export interface NormalizedDividend {
  date: string;
  symbol: string;
  company: string;
  grossAmount: number;   // EUR
  taxWithheld: number;   // EUR
  netAmount: number;     // EUR
  currency: string;
  perShare?: number;
  taxRate?: number;
  broker: 'IB' | 'Swedbank' | 'WIX' | 'Revolut';
  isin?: string;
}

// Fee record (storage fees, etc.)
export interface NormalizedFee {
  date: string;
  description: string;
  amount: number;  // EUR
  broker: string;
}

// FIFO lot tracking
export interface OpenLot {
  date: string;
  quantity: number;
  priceEUR: number; // per-share cost in EUR
  broker: string;
}

// Current open position
export interface Position {
  symbol: string;
  description: string;
  totalQuantity: number;
  avgCostEUR: number;     // per-share avg cost in EUR
  totalCostEUR: number;
  currentPriceNative: number;
  currentPriceEUR: number;
  currentValueEUR: number;
  unrealizedPnLEUR: number;
  unrealizedPnLPct: number;
  currency: string;
  country: string;
  brokers: string[];
  lots: OpenLot[];
}

// Realized (closed) trade
export interface ClosedTrade {
  date: string;
  symbol: string;
  description: string;
  quantity: number;
  costBasisEUR: number;
  proceedsEUR: number;
  realizedPnLEUR: number;
  broker: string;
}

// WIX grant tracking
export interface WixGrant {
  grantId: string;
  grantDate: string;
  vestEvents: { date: string; shares: number; status: 'vested' | 'upcoming' }[];
  totalShares: number;
  vestedShares: number;
  upcomingShares: number;
}

// WIX ESPP purchase
export interface WixESPP {
  date: string;
  shares: number;
  priceUSD: number;
  totalUSD: number;
  esppId: string;
  type: 'Quick Sale' | 'Keep';
}

// WIX-specific data bundle
export interface WixData {
  grants: WixGrant[];
  esppPurchases: WixESPP[];
  sells: NormalizedTrade[];
  totalVested: number;
  totalSold: number;
  totalSoldProceeds: number;
}

// Dividend summary
export interface DividendSummary {
  totalGross: number;
  totalTax: number;
  totalNet: number;
  paymentCount: number;
  bySymbol: Record<string, { gross: number; tax: number; net: number; count: number }>;
}

// Full aggregated portfolio data
export interface PortfolioData {
  positions: Position[];
  closedTrades: ClosedTrade[];
  trades: NormalizedTrade[];
  dividends: NormalizedDividend[];
  dividendSummary: DividendSummary;
  fees: NormalizedFee[];
  totalFees: number;
  wixData: WixData | null;
  summary: {
    totalValue: number;
    totalCost: number;
    unrealizedPnL: number;
    unrealizedPnLPct: number;
    realizedPnL: number;
    totalDividends: number;
    positionCount: number;
  };
}

// API response type
export interface PortfolioFilesResponse {
  [broker: string]: { [filename: string]: string };
}
