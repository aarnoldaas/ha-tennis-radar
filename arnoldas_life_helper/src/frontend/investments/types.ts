export interface ITransaction {
  id: string;
  broker: string;
  type: string;
  date: string;
  symbol: string;
  description: string;
  quantity: number;
  pricePerUnit: number;
  amount: number;
  currency: string;
  fees: number;
  amountInBaseCurrency: number;
  raw?: { debitCredit?: string };
}

export interface ILot {
  acquisitionDate: string;
  remainingQuantity: number;
  costBasisPerShare: number;
  source: string;
  broker: string;
  currency: string;
}

export interface IHolding {
  symbol: string;
  name: string;
  brokers?: string[];
  lots?: ILot[];
  totalQuantity: number;
  averageCostBasis: number;
  totalCostBasis: number;
  currency: string;
  currentPrice: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  totalCostBasisEur: number;
  currentValueEur: number;
  unrealizedPnlEur: number;
  priceLastUpdated: string | null;
}

export interface IRealizedTrade {
  sellTransactionId: string;
  symbol: string;
  broker: string;
  sellDate: string;
  quantity: number;
  salePricePerShare: number;
  proceeds: number;
  currency: string;
  totalCostBasis: number;
  realizedPnl: number;
  fees: number;
  holdPeriod: 'short-term' | 'long-term';
  proceedsEur: number;
  totalCostBasisEur: number;
  realizedPnlEur: number;
}

export interface IDividendPayment {
  transactionId: string;
  date: string;
  symbol: string;
  broker: string;
  amount: number;
  currency: string;
  amountEur: number;
  description: string;
}

export interface InterestSummary {
  flexibleCashEur: number;
  flexibleCashUsd: number;
  savingsEur: number;
  savingsUsd: number;
  totalEur: number;
}

export interface AllocationEntry {
  name: string;
  valueEur: number;
  percent: number;
}

export interface AllocationBreakdown {
  byGeography: AllocationEntry[];
  byAssetClass: AllocationEntry[];
  byCurrency: AllocationEntry[];
  bySector: AllocationEntry[];
}

export interface RiskWarning {
  type: string;
  severity: 'warning' | 'info';
  message: string;
}

export interface RsuByYear {
  year: number;
  totalShares: number;
  totalCompensation: number;
  totalCompensationEur: number;
}

export interface RsuVesting {
  grantId: string;
  vestingDate: string;
  shares: number;
  fmvAtVesting: number;
  compensationValue: number;
  compensationValueEur: number;
  isSameDaySale: boolean;
}

export interface RsuByGrant {
  grantId: string;
  totalShares: number;
  totalCompensation: number;
  vestings: RsuVesting[];
}

export interface RsuCompensationSummary {
  totalCompensation: number;
  totalCompensationEur: number;
  byYear: RsuByYear[];
  byGrant?: RsuByGrant[];
  cumulative?: Array<{ date: string; cumulativeCompensation: number; cumulativeCompensationEur: number }>;
}

export interface EsppSummary {
  totalSharesPurchased: number;
  totalCostBasis: number;
  totalFmvAtPurchase: number;
  totalDiscountCaptured: number;
  totalDiscountCapturedEur: number;
  averageDiscountPercent: number;
}

export interface StockStats {
  symbol: string;
  currentQty: number;
  costBasisEur: number;
  currentValueEur: number;
  unrealizedPnlEur: number;
  realizedPnlEur: number;
  dividendsEur: number;
  feesEur: number;
  totalPnlEur: number;
  totalInvestedEur: number;
  tradeCount: number;
  firstDate: string;
  isOpen: boolean;
}

export interface StockTradeAnalysis {
  symbol: string;
  avgBuyPrice: number;
  avgSellPrice: number | null;
  lastBuyDate: string | null;
  lastBuyPrice: number | null;
  lastSellDate: string | null;
  lastSellPrice: number | null;
  totalBoughtQty: number;
  totalSoldQty: number;
  buyCount: number;
  sellCount: number;
  currency: string;
  currentPrice: number | null;
  winRate: number | null;
  bestTradeEur: number | null;
  worstTradeEur: number | null;
  avgHoldDays: number | null;
  isOpen: boolean;
}

export interface StockInfo {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number;
  peRatio: number | null;
  forwardPeRatio: number | null;
  epsTrailingTwelveMonths: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  exDividendDate: string | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  beta: number | null;
  earningsDate: string | null;
  divGrowthRate5Y: number | null;
  lastUpdated: string;
}

export interface PriceHistoryEntry {
  date: string;
  price: number;
  currency: string;
}

export interface AiSuggestions {
  suggestions: string | null;
  generatedAt: string | null;
}

export interface InvestmentData {
  transactions: ITransaction[];
  holdings: IHolding[];
  realizedTrades: IRealizedTrade[];
  dividends: IDividendPayment[];
  interestSummary: InterestSummary | null;
  totalRealizedPnlEur: number;
  totalDividendsEur: number;
  totalInterestEur: number;
  priceRefreshTime: string | null;
  allocation: AllocationBreakdown;
  riskWarnings: RiskWarning[];
  rsuCompensation: RsuCompensationSummary;
  esppSummary: EsppSummary;
  tickerMeta?: Record<string, { geography: string; sector: string; currencyExposure: string }>;
  portfolioSummary: { totalCost: number; totalValue: number; unrealizedPnl: number; totalRealizedPnl: number; totalDividends: number; totalInterest: number; totalIncome: number; totalReturn: number; totalReturnPct: number };
  stockStats: StockStats[];
  stockStatsTotals: { totalInvested: number; realizedPnl: number; unrealizedPnl: number; dividends: number; totalPnl: number };
  dividendsByStock: Array<{ symbol: string; count: number; totalEur: number }>;
  realizedTradeSummary: { totalPnl: number; shortTermPnl: number; longTermPnl: number; shortTermCount: number; longTermCount: number };
  rsuByYearWithCumulative: Array<{ year: number; totalShares: number; totalCompensation: number; totalCompensationEur: number; cumulativeUsd: number; cumulativeEur: number }>;
  priceHistory: Record<string, PriceHistoryEntry[]>;
  stockInfo: StockInfo[];
  stockTradeAnalysis: StockTradeAnalysis[];
}

export type SortDir = 'asc' | 'desc';
