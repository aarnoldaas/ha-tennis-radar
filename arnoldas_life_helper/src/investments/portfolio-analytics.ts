// ============================================================================
// Portfolio Analytics — Pre-computed summaries for the frontend
// ============================================================================

import type {
  IHolding,
  IRealizedTrade,
  IDividendPayment,
  ITransaction,
  IStockStats,
  IStockTradeAnalysis,
  IPortfolioSummary,
  IDividendByStock,
  IRealizedTradeSummary,
  IStockStatsTotals,
  IRsuYearWithCumulative,
  IRsuCompensationSummary,
} from './types.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ----------------------------------------------------------------------------
// Stock-by-stock aggregation
// ----------------------------------------------------------------------------

export function computeStockStats(
  holdings: IHolding[],
  realizedTrades: IRealizedTrade[],
  dividends: IDividendPayment[],
  transactions: ITransaction[],
): IStockStats[] {
  const map = new Map<string, IStockStats>();

  const getOrCreate = (symbol: string): IStockStats => {
    if (!map.has(symbol)) {
      map.set(symbol, {
        symbol,
        currentQty: 0,
        costBasisEur: 0,
        currentValueEur: 0,
        unrealizedPnlEur: 0,
        realizedPnlEur: 0,
        dividendsEur: 0,
        feesEur: 0,
        totalPnlEur: 0,
        totalInvestedEur: 0,
        tradeCount: 0,
        firstDate: '',
        isOpen: false,
      });
    }
    return map.get(symbol)!;
  };

  // Holdings: current positions
  for (const h of holdings) {
    const s = getOrCreate(h.symbol);
    s.currentQty = h.totalQuantity;
    s.costBasisEur = h.totalCostBasisEur;
    s.currentValueEur = h.currentValueEur;
    s.unrealizedPnlEur = h.unrealizedPnlEur;
    s.isOpen = true;
  }

  // Realized trades
  for (const t of realizedTrades) {
    const s = getOrCreate(t.symbol);
    s.realizedPnlEur += t.realizedPnlEur;
    s.tradeCount += 1;
  }

  // Dividends
  for (const d of dividends) {
    const s = getOrCreate(d.symbol);
    s.dividendsEur += d.amountEur;
  }

  // Total invested (sum of BUY transaction amounts) and fees and first date
  for (const t of transactions) {
    if (!t.symbol) continue;
    const s = getOrCreate(t.symbol);
    if (!s.firstDate || t.date < s.firstDate) s.firstDate = t.date;
    if (t.type === 'BUY' || t.type === 'RSU_VEST' || t.type === 'ESPP_PURCHASE') {
      s.totalInvestedEur += t.amountInBaseCurrency;
    }
    if (t.fees > 0) {
      const feeRatio = t.amountInBaseCurrency > 0 && t.amount > 0
        ? t.amountInBaseCurrency / t.amount
        : 1;
      s.feesEur += t.fees * feeRatio;
    }
  }

  // Compute total P&L and round
  for (const s of map.values()) {
    s.totalPnlEur = s.realizedPnlEur + s.unrealizedPnlEur + s.dividendsEur;
    s.costBasisEur = round2(s.costBasisEur);
    s.currentValueEur = round2(s.currentValueEur);
    s.unrealizedPnlEur = round2(s.unrealizedPnlEur);
    s.realizedPnlEur = round2(s.realizedPnlEur);
    s.dividendsEur = round2(s.dividendsEur);
    s.feesEur = round2(s.feesEur);
    s.totalPnlEur = round2(s.totalPnlEur);
    s.totalInvestedEur = round2(s.totalInvestedEur);
  }

  return [...map.values()].sort((a, b) => b.totalPnlEur - a.totalPnlEur);
}

// ----------------------------------------------------------------------------
// Stock stats totals
// ----------------------------------------------------------------------------

export function computeStockStatsTotals(stats: IStockStats[]): IStockStatsTotals {
  return {
    totalInvested: round2(stats.reduce((s, st) => s + st.totalInvestedEur, 0)),
    realizedPnl: round2(stats.reduce((s, st) => s + st.realizedPnlEur, 0)),
    unrealizedPnl: round2(stats.reduce((s, st) => s + st.unrealizedPnlEur, 0)),
    dividends: round2(stats.reduce((s, st) => s + st.dividendsEur, 0)),
    totalPnl: round2(stats.reduce((s, st) => s + st.totalPnlEur, 0)),
  };
}

// ----------------------------------------------------------------------------
// Portfolio summary
// ----------------------------------------------------------------------------

export function computePortfolioSummary(
  holdings: IHolding[],
  totalRealizedPnlEur: number,
  totalDividendsEur: number,
  totalInterestEur: number,
): IPortfolioSummary {
  const totalCost = holdings.reduce((s, h) => s + h.totalCostBasisEur, 0);
  const totalValue = holdings.reduce((s, h) => s + h.currentValueEur, 0);
  const unrealizedPnl = holdings.reduce((s, h) => s + h.unrealizedPnlEur, 0);
  const totalIncome = totalDividendsEur + totalInterestEur;
  const totalReturn = unrealizedPnl + totalRealizedPnlEur + totalIncome;
  const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

  return {
    totalCost: round2(totalCost),
    totalValue: round2(totalValue),
    unrealizedPnl: round2(unrealizedPnl),
    totalRealizedPnl: round2(totalRealizedPnlEur),
    totalDividends: round2(totalDividendsEur),
    totalInterest: round2(totalInterestEur),
    totalIncome: round2(totalIncome),
    totalReturn: round2(totalReturn),
    totalReturnPct: round2(totalReturnPct),
  };
}

// ----------------------------------------------------------------------------
// Dividends by stock
// ----------------------------------------------------------------------------

export function computeDividendsByStock(dividends: IDividendPayment[]): IDividendByStock[] {
  const map = new Map<string, IDividendByStock>();
  for (const d of dividends) {
    const entry = map.get(d.symbol) || { symbol: d.symbol, count: 0, totalEur: 0 };
    entry.count += 1;
    entry.totalEur += d.amountEur;
    map.set(d.symbol, entry);
  }
  return [...map.values()]
    .map(e => ({ ...e, totalEur: round2(e.totalEur) }))
    .sort((a, b) => b.totalEur - a.totalEur);
}

// ----------------------------------------------------------------------------
// Realized trade summary
// ----------------------------------------------------------------------------

export function computeRealizedTradeSummary(realizedTrades: IRealizedTrade[]): IRealizedTradeSummary {
  const shortTerm = realizedTrades.filter(t => t.holdPeriod === 'short-term');
  const longTerm = realizedTrades.filter(t => t.holdPeriod === 'long-term');
  return {
    totalPnl: round2(realizedTrades.reduce((s, t) => s + t.realizedPnlEur, 0)),
    shortTermPnl: round2(shortTerm.reduce((s, t) => s + t.realizedPnlEur, 0)),
    longTermPnl: round2(longTerm.reduce((s, t) => s + t.realizedPnlEur, 0)),
    shortTermCount: shortTerm.length,
    longTermCount: longTerm.length,
  };
}

// ----------------------------------------------------------------------------
// RSU by-year with cumulative
// ----------------------------------------------------------------------------

export function computeRsuByYearWithCumulative(
  byYear: IRsuCompensationSummary['byYear'],
): IRsuYearWithCumulative[] {
  let cumUsd = 0;
  let cumEur = 0;
  return byYear.map(y => {
    cumUsd += y.totalCompensation;
    cumEur += y.totalCompensationEur;
    return {
      year: y.year,
      totalShares: y.totalShares,
      totalCompensation: y.totalCompensation,
      totalCompensationEur: y.totalCompensationEur,
      cumulativeUsd: round2(cumUsd),
      cumulativeEur: round2(cumEur),
    };
  });
}

// ----------------------------------------------------------------------------
// Per-stock trade analysis (buy/sell price stats)
// ----------------------------------------------------------------------------

export function computeStockTradeAnalysis(
  transactions: ITransaction[],
  holdings: IHolding[],
  realizedTrades: IRealizedTrade[],
): IStockTradeAnalysis[] {
  const symbols = new Set<string>();
  for (const t of transactions) {
    if (t.symbol && (t.type === 'BUY' || t.type === 'SELL')) symbols.add(t.symbol);
  }

  const holdingMap = new Map<string, IHolding>();
  for (const h of holdings) holdingMap.set(h.symbol, h);

  const realizedBySymbol = new Map<string, IRealizedTrade[]>();
  for (const rt of realizedTrades) {
    const arr = realizedBySymbol.get(rt.symbol) || [];
    arr.push(rt);
    realizedBySymbol.set(rt.symbol, arr);
  }

  const result: IStockTradeAnalysis[] = [];

  for (const symbol of symbols) {
    const buys = transactions.filter(t => t.symbol === symbol && t.type === 'BUY');
    const sells = transactions.filter(t => t.symbol === symbol && t.type === 'SELL');

    if (buys.length === 0 && sells.length === 0) continue;

    // Weighted average buy price
    let totalBoughtQty = 0;
    let totalBoughtCost = 0;
    let lastBuyDate: string | null = null;
    let lastBuyPrice: number | null = null;
    let currency = '';

    for (const b of buys) {
      totalBoughtQty += Math.abs(b.quantity);
      totalBoughtCost += Math.abs(b.quantity) * b.pricePerUnit;
      if (!currency) currency = b.currency;
      if (!lastBuyDate || b.date > lastBuyDate) {
        lastBuyDate = b.date;
        lastBuyPrice = b.pricePerUnit;
      }
    }
    const avgBuyPrice = totalBoughtQty > 0 ? round2(totalBoughtCost / totalBoughtQty) : 0;

    // Weighted average sell price
    let totalSoldQty = 0;
    let totalSoldProceeds = 0;
    let lastSellDate: string | null = null;
    let lastSellPrice: number | null = null;

    for (const s of sells) {
      totalSoldQty += Math.abs(s.quantity);
      totalSoldProceeds += Math.abs(s.quantity) * s.pricePerUnit;
      if (!currency) currency = s.currency;
      if (!lastSellDate || s.date > lastSellDate) {
        lastSellDate = s.date;
        lastSellPrice = s.pricePerUnit;
      }
    }
    const avgSellPrice = totalSoldQty > 0 ? round2(totalSoldProceeds / totalSoldQty) : null;

    // Current price from holding
    const holding = holdingMap.get(symbol);
    const currentPrice = holding ? holding.currentPrice : null;

    // Win rate and best/worst trade from realized trades
    const trades = realizedBySymbol.get(symbol) || [];
    let winRate: number | null = null;
    let bestTradeEur: number | null = null;
    let worstTradeEur: number | null = null;
    let avgHoldDays: number | null = null;

    if (trades.length > 0) {
      const wins = trades.filter(t => t.realizedPnlEur > 0).length;
      winRate = round2((wins / trades.length) * 100);
      bestTradeEur = round2(Math.max(...trades.map(t => t.realizedPnlEur)));
      worstTradeEur = round2(Math.min(...trades.map(t => t.realizedPnlEur)));

      // Average hold days
      let totalDays = 0;
      let count = 0;
      for (const t of trades) {
        if (t.lotsConsumed && t.lotsConsumed.length > 0) {
          const acquDate = t.lotsConsumed[0].lot.acquisitionDate;
          const diff = (new Date(t.sellDate).getTime() - new Date(acquDate).getTime()) / (1000 * 60 * 60 * 24);
          totalDays += diff;
          count++;
        }
      }
      avgHoldDays = count > 0 ? Math.round(totalDays / count) : null;
    }

    result.push({
      symbol,
      avgBuyPrice,
      avgSellPrice,
      lastBuyDate,
      lastBuyPrice: lastBuyPrice !== null ? round2(lastBuyPrice) : null,
      lastSellDate,
      lastSellPrice: lastSellPrice !== null ? round2(lastSellPrice) : null,
      totalBoughtQty: round2(totalBoughtQty),
      totalSoldQty: round2(totalSoldQty),
      buyCount: buys.length,
      sellCount: sells.length,
      currency,
      currentPrice: currentPrice !== null ? round2(currentPrice!) : null,
      winRate,
      bestTradeEur,
      worstTradeEur,
      avgHoldDays,
      isOpen: !!holding,
    });
  }

  return result.sort((a, b) => b.totalBoughtQty - a.totalBoughtQty);
}
