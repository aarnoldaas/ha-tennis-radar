import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parseAllSwedbankFiles, classifySwedbankTransactions } from './swedbank-parser.js';
import { parseAllRevolutFiles, classifyRevolutTransactions, type RevolutInterestSummary } from './revolut-parser.js';
import { parseAllIBFiles, classifyIBTransactions } from './ib-parser.js';
import { parseAllWixFiles, classifyWixTransactions } from './wix-parser.js';
import { computeHoldings } from './holdings.js';
import { refreshPrices, getKnownTickers, getPriceRefreshTime, loadPriceHistory, getAllPriceHistory, getAllStockInfo } from './prices.js';
import type { PriceEntry, StockInfo } from './prices.js';
import type { ITransaction, IHolding, IRealizedTrade, IDividendPayment, IRsuCompensationSummary } from './types.js';
import { convertAmount } from './currency.js';
import { computeAllocation, computeRiskWarnings, buildTickerMetaMap, type AllocationBreakdown, type RiskWarning, type TickerMeta } from './analytics.js';
import { computeRsuCompensation, computeEsppSummary, type EsppSummary } from './equity-compensation.js';
import { computeStockStats, computeStockStatsTotals, computePortfolioSummary, computeDividendsByStock, computeRealizedTradeSummary, computeRsuByYearWithCumulative, computeStockTradeAnalysis } from './portfolio-analytics.js';
import type { IStockStats, IStockTradeAnalysis, IPortfolioSummary, IDividendByStock, IRealizedTradeSummary, IStockStatsTotals, IRsuYearWithCumulative } from './types.js';

export interface InvestmentData {
  transactions: ITransaction[];
  holdings: IHolding[];
  realizedTrades: IRealizedTrade[];
  dividends: IDividendPayment[];
  interestSummary: RevolutInterestSummary | null;
  /** Total realized P&L in EUR */
  totalRealizedPnlEur: number;
  /** Total dividends in EUR */
  totalDividendsEur: number;
  /** Total interest in EUR */
  totalInterestEur: number;
  /** ISO timestamp of last price refresh, null if never refreshed */
  priceRefreshTime: string | null;
  /** Portfolio allocation breakdown */
  allocation: AllocationBreakdown;
  /** Concentration risk warnings */
  riskWarnings: RiskWarning[];
  /** RSU compensation summary */
  rsuCompensation: IRsuCompensationSummary;
  /** ESPP summary */
  esppSummary: EsppSummary;
  /** Ticker metadata (geography, sector, etc.) */
  tickerMeta: Record<string, TickerMeta>;
  /** Pre-computed portfolio summary */
  portfolioSummary: IPortfolioSummary;
  /** Per-stock aggregated statistics */
  stockStats: IStockStats[];
  /** Stock stats totals */
  stockStatsTotals: IStockStatsTotals;
  /** Dividends aggregated by stock */
  dividendsByStock: IDividendByStock[];
  /** Realized trade summary (all years) */
  realizedTradeSummary: IRealizedTradeSummary;
  /** RSU by-year with cumulative columns */
  rsuByYearWithCumulative: IRsuYearWithCumulative[];
  /** Price history per ticker (file-based + hardcoded merged) */
  priceHistory: Record<string, PriceEntry[]>;
  /** Stock fundamental info (P/E, dividends, etc.) */
  stockInfo: StockInfo[];
  /** Per-stock trade analysis (buy/sell price stats) */
  stockTradeAnalysis: IStockTradeAnalysis[];
}

let cached: InvestmentData | null = null;
let lastDataDir: string = '';

function computeDividends(transactions: ITransaction[]): IDividendPayment[] {
  return transactions
    .filter(t => t.type === 'DIVIDEND')
    .map(t => ({
      transactionId: t.id,
      date: t.date,
      symbol: t.symbol,
      broker: t.broker,
      amount: t.amount,
      currency: t.currency,
      amountEur: convertAmount(t.amount, t.date, t.currency, 'EUR'),
      perShareRate: t.pricePerUnit > 0 ? t.pricePerUnit : null,
      description: t.description,
    }));
}

export async function loadInvestmentData(dataDir: string): Promise<InvestmentData> {
  lastDataDir = dataDir;

  // Load file-based price history
  loadPriceHistory(dataDir);

  const swedbankDir = join(dataDir, 'Investments', 'swedbank');
  const revolutDir = join(dataDir, 'Investments', 'revolut');

  let transactions: ITransaction[] = [];
  let interestSummary: RevolutInterestSummary | null = null;

  // Swedbank
  if (existsSync(swedbankDir)) {
    const rawTransactions = await parseAllSwedbankFiles(swedbankDir);
    const swedbankTxns = classifySwedbankTransactions(rawTransactions);
    transactions.push(...swedbankTxns);
    console.log(`[Investments] Parsed ${swedbankTxns.length} Swedbank transactions`);
  } else {
    console.log(`[Investments] No Swedbank data found at ${swedbankDir}`);
  }

  // Interactive Brokers
  const ibDir = join(dataDir, 'Investments', 'interactive-brokers');
  if (existsSync(ibDir)) {
    const ibStatements = await parseAllIBFiles(ibDir);
    const ibTxns = classifyIBTransactions(ibStatements);
    transactions.push(...ibTxns);
    const totalTrades = ibStatements.reduce((s, st) => s + st.trades.length, 0);
    const totalDivs = ibStatements.reduce((s, st) => s + st.dividends.length, 0);
    console.log(`[Investments] Parsed ${ibTxns.length} IB transactions from ${ibStatements.length} statements (${totalTrades} trades, ${totalDivs} dividends)`);
  } else {
    console.log(`[Investments] No IB data found at ${ibDir}`);
  }

  // Wix
  const wixDir = join(dataDir, 'Investments', 'wix');
  if (existsSync(wixDir)) {
    const wixData = await parseAllWixFiles(wixDir);
    const wixTxns = classifyWixTransactions(wixData);
    transactions.push(...wixTxns);
    console.log(`[Investments] Parsed ${wixTxns.length} Wix transactions (issued: ${wixData.issued.length}, sold: ${wixData.sold.length})`);
  } else {
    console.log(`[Investments] No Wix data found at ${wixDir}`);
  }

  // Revolut
  if (existsSync(revolutDir)) {
    const revolutData = await parseAllRevolutFiles(revolutDir);
    const revolutTxns = classifyRevolutTransactions(revolutData);
    transactions.push(...revolutTxns);
    interestSummary = revolutData.interestSummary;
    console.log(`[Investments] Parsed ${revolutTxns.length} Revolut transactions (brokerage: ${revolutData.brokerageEur.length + revolutData.brokerageUsd.length}, crypto: ${revolutData.crypto.length})`);
    console.log(`[Investments] Revolut interest: €${revolutData.interestSummary.totalEur}`);
  } else {
    console.log(`[Investments] No Revolut data found at ${revolutDir}`);
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  const { holdings, realizedTrades } = await computeHoldings(transactions);
  console.log(`[Investments] Computed ${holdings.length} holdings, ${realizedTrades.length} realized trades`);

  const dividends = computeDividends(transactions);
  const totalRealizedPnlEur = realizedTrades.reduce((s, rt) => s + rt.realizedPnlEur, 0);
  const totalDividendsEur = dividends.reduce((s, d) => s + d.amountEur, 0);
  const totalInterestEur = interestSummary?.totalEur ?? 0;

  const allocation = computeAllocation(holdings);
  const riskWarnings = computeRiskWarnings(holdings);
  const rsuCompensation = computeRsuCompensation(transactions);
  const esppSummary = computeEsppSummary(transactions);
  const tickerMeta = buildTickerMetaMap(holdings);

  const stockStats = computeStockStats(holdings, realizedTrades, dividends, transactions);
  const stockStatsTotals = computeStockStatsTotals(stockStats);
  const portfolioSummary = computePortfolioSummary(holdings, totalRealizedPnlEur, totalDividendsEur, totalInterestEur);
  const dividendsByStock = computeDividendsByStock(dividends);
  const realizedTradeSummary = computeRealizedTradeSummary(realizedTrades);
  const rsuByYearWithCumulative = computeRsuByYearWithCumulative(rsuCompensation.byYear);
  const stockTradeAnalysis = computeStockTradeAnalysis(transactions, holdings, realizedTrades);

  console.log(`[Investments] RSU compensation: $${rsuCompensation.totalCompensation} (${rsuCompensation.byYear.length} years)`);
  console.log(`[Investments] ESPP: ${esppSummary.totalSharesPurchased} shares, ${esppSummary.averageDiscountPercent}% avg discount`);
  console.log(`[Investments] Risk warnings: ${riskWarnings.length}`);

  cached = {
    transactions,
    holdings,
    realizedTrades,
    dividends,
    interestSummary,
    totalRealizedPnlEur: Math.round(totalRealizedPnlEur * 100) / 100,
    totalDividendsEur: Math.round(totalDividendsEur * 100) / 100,
    totalInterestEur: Math.round(totalInterestEur * 100) / 100,
    priceRefreshTime: getPriceRefreshTime(),
    allocation,
    riskWarnings,
    rsuCompensation,
    esppSummary,
    tickerMeta,
    portfolioSummary,
    stockStats,
    stockStatsTotals,
    dividendsByStock,
    realizedTradeSummary,
    rsuByYearWithCumulative,
    priceHistory: getAllPriceHistory(),
    stockInfo: getAllStockInfo(),
    stockTradeAnalysis,
  };
  return cached;
}

/**
 * Refresh live prices for all held tickers, then recompute holdings.
 */
export async function refreshInvestmentPrices(): Promise<{ fetched: number; failed: string[] }> {
  // Collect tickers from current holdings
  const heldTickers = cached ? cached.holdings.map(h => h.symbol) : [];
  const allTickers = [...new Set([...heldTickers, ...getKnownTickers()])];

  const result = await refreshPrices(allTickers);
  console.log(`[Investments] Price refresh: ${result.fetched} fetched, ${result.failed.length} failed${result.failed.length > 0 ? ` (${result.failed.join(', ')})` : ''}`);

  // Recompute holdings with fresh prices
  if (lastDataDir) {
    await loadInvestmentData(lastDataDir);
  }

  return result;
}

export function getInvestmentData(): InvestmentData | null {
  return cached;
}
