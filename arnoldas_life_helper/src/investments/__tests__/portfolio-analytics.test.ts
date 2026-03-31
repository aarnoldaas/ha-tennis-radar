import { describe, it, expect } from 'vitest';
import {
  computeStockStats,
  computeStockStatsTotals,
  computePortfolioSummary,
  computeDividendsByStock,
  computeRealizedTradeSummary,
  computeRsuByYearWithCumulative,
} from '../portfolio-analytics.js';
import type { IHolding, IRealizedTrade, IDividendPayment, ITransaction, Broker, TransactionType } from '../types.js';

// --- Helpers ---

function makeHolding(overrides: Partial<IHolding> & { symbol: string }): IHolding {
  return {
    name: overrides.symbol,
    brokers: ['swedbank'] as Broker[],
    lots: [],
    totalQuantity: 100,
    averageCostBasis: 10,
    totalCostBasis: 1000,
    currency: 'EUR',
    currentPrice: 12,
    currentValue: 1200,
    unrealizedPnl: 200,
    unrealizedPnlPercent: 20,
    totalCostBasisEur: 1000,
    currentValueEur: 1200,
    unrealizedPnlEur: 200,
    priceLastUpdated: null,
    ...overrides,
  };
}

function makeRealizedTrade(overrides: Partial<IRealizedTrade> & { symbol: string }): IRealizedTrade {
  return {
    sellTransactionId: `sell-${Math.random().toString(36).slice(2)}`,
    broker: 'swedbank' as Broker,
    sellDate: '2024-06-01',
    quantity: 50,
    salePricePerShare: 15,
    proceeds: 750,
    currency: 'EUR',
    lotsConsumed: [],
    totalCostBasis: 500,
    realizedPnl: 250,
    fees: 0,
    holdPeriod: 'short-term',
    proceedsEur: 750,
    totalCostBasisEur: 500,
    realizedPnlEur: 250,
    ...overrides,
  };
}

function makeDividend(overrides: Partial<IDividendPayment> & { symbol: string }): IDividendPayment {
  return {
    transactionId: `div-${Math.random().toString(36).slice(2)}`,
    date: '2024-06-15',
    broker: 'swedbank' as Broker,
    amount: 50,
    currency: 'EUR',
    amountEur: 50,
    perShareRate: null,
    description: 'Dividend',
    ...overrides,
  };
}

function makeTxn(overrides: Partial<ITransaction> & { symbol: string; type: TransactionType }): ITransaction {
  return {
    id: `txn-${Math.random().toString(36).slice(2)}`,
    broker: 'swedbank' as Broker,
    date: '2024-01-01',
    description: '',
    quantity: 0,
    pricePerUnit: 0,
    amount: 0,
    currency: 'EUR',
    fees: 0,
    amountInBaseCurrency: 0,
    ...overrides,
  };
}

// --- Tests ---

describe('computeStockStats', () => {
  it('returns empty array for empty inputs', () => {
    const result = computeStockStats([], [], [], []);
    expect(result).toEqual([]);
  });

  it('reflects holding values for a single holding', () => {
    const holdings = [makeHolding({ symbol: 'TEST', totalCostBasisEur: 1000, currentValueEur: 1200, unrealizedPnlEur: 200, totalQuantity: 100 })];
    const result = computeStockStats(holdings, [], [], []);
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('TEST');
    expect(result[0].costBasisEur).toBe(1000);
    expect(result[0].currentValueEur).toBe(1200);
    expect(result[0].unrealizedPnlEur).toBe(200);
    expect(result[0].isOpen).toBe(true);
  });

  it('aggregates realized trades per symbol', () => {
    const trades = [
      makeRealizedTrade({ symbol: 'TEST', realizedPnlEur: 100 }),
      makeRealizedTrade({ symbol: 'TEST', realizedPnlEur: 50 }),
    ];
    const result = computeStockStats([], trades, [], []);
    const test = result.find(s => s.symbol === 'TEST')!;
    expect(test.realizedPnlEur).toBe(150);
    expect(test.tradeCount).toBe(2);
    expect(test.isOpen).toBe(false);
  });

  it('aggregates dividends per symbol', () => {
    const dividends = [
      makeDividend({ symbol: 'TEST', amountEur: 30 }),
      makeDividend({ symbol: 'TEST', amountEur: 20 }),
    ];
    const result = computeStockStats([], [], dividends, []);
    expect(result.find(s => s.symbol === 'TEST')!.dividendsEur).toBe(50);
  });

  it('computes totalInvestedEur from BUY transactions', () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', amountInBaseCurrency: 500, date: '2024-01-01' }),
      makeTxn({ symbol: 'TEST', type: 'BUY', amountInBaseCurrency: 300, date: '2024-02-01' }),
    ];
    const result = computeStockStats([], [], [], txns);
    expect(result.find(s => s.symbol === 'TEST')!.totalInvestedEur).toBe(800);
  });

  it('includes RSU_VEST and ESPP_PURCHASE in totalInvestedEur', () => {
    const txns = [
      makeTxn({ symbol: 'WIX', type: 'RSU_VEST', amountInBaseCurrency: 1000, date: '2024-01-01' }),
      makeTxn({ symbol: 'WIX', type: 'ESPP_PURCHASE', amountInBaseCurrency: 500, date: '2024-03-01' }),
    ];
    const result = computeStockStats([], [], [], txns);
    expect(result.find(s => s.symbol === 'WIX')!.totalInvestedEur).toBe(1500);
  });

  it('tracks first transaction date', () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', date: '2024-03-01' }),
      makeTxn({ symbol: 'TEST', type: 'BUY', date: '2024-01-01' }),
    ];
    const result = computeStockStats([], [], [], txns);
    expect(result.find(s => s.symbol === 'TEST')!.firstDate).toBe('2024-01-01');
  });

  it('computes totalPnlEur = realized + unrealized + dividends', () => {
    const holdings = [makeHolding({ symbol: 'TEST', unrealizedPnlEur: 100 })];
    const trades = [makeRealizedTrade({ symbol: 'TEST', realizedPnlEur: 50 })];
    const dividends = [makeDividend({ symbol: 'TEST', amountEur: 25 })];
    const result = computeStockStats(holdings, trades, dividends, []);
    expect(result[0].totalPnlEur).toBe(175);
  });

  it('sorts by totalPnlEur descending', () => {
    const holdings = [
      makeHolding({ symbol: 'LOW', unrealizedPnlEur: 10 }),
      makeHolding({ symbol: 'HIGH', unrealizedPnlEur: 500 }),
    ];
    const result = computeStockStats(holdings, [], [], []);
    expect(result[0].symbol).toBe('HIGH');
    expect(result[1].symbol).toBe('LOW');
  });

  it('rounds values to 2 decimal places', () => {
    const dividends = [
      makeDividend({ symbol: 'TEST', amountEur: 10.333 }),
      makeDividend({ symbol: 'TEST', amountEur: 10.333 }),
    ];
    const result = computeStockStats([], [], dividends, []);
    expect(result[0].dividendsEur).toBe(20.67);
  });

  it('handles multiple symbols independently', () => {
    const holdings = [
      makeHolding({ symbol: 'AAA', currentValueEur: 100 }),
      makeHolding({ symbol: 'BBB', currentValueEur: 200 }),
    ];
    const result = computeStockStats(holdings, [], [], []);
    expect(result).toHaveLength(2);
    expect(result.find(s => s.symbol === 'AAA')!.currentValueEur).toBe(100);
    expect(result.find(s => s.symbol === 'BBB')!.currentValueEur).toBe(200);
  });

  it('approximates fee conversion using amount ratio', () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'SELL', fees: 10, amount: 100, amountInBaseCurrency: 90, date: '2024-01-01' }),
    ];
    const result = computeStockStats([], [], [], txns);
    // feeRatio = 90/100 = 0.9, feesEur = 10 * 0.9 = 9
    expect(result[0].feesEur).toBe(9);
  });
});

describe('computeStockStatsTotals', () => {
  it('returns zeros for empty array', () => {
    const result = computeStockStatsTotals([]);
    expect(result).toEqual({ totalInvested: 0, realizedPnl: 0, unrealizedPnl: 0, dividends: 0, totalPnl: 0 });
  });

  it('sums all fields correctly', () => {
    const stats = [
      { symbol: 'A', currentQty: 0, costBasisEur: 0, currentValueEur: 0, unrealizedPnlEur: 100, realizedPnlEur: 50, dividendsEur: 25, feesEur: 5, totalPnlEur: 175, totalInvestedEur: 500, tradeCount: 1, firstDate: '2024-01-01', isOpen: true },
      { symbol: 'B', currentQty: 0, costBasisEur: 0, currentValueEur: 0, unrealizedPnlEur: 200, realizedPnlEur: 100, dividendsEur: 50, feesEur: 10, totalPnlEur: 350, totalInvestedEur: 1000, tradeCount: 2, firstDate: '2024-01-01', isOpen: false },
    ];
    const result = computeStockStatsTotals(stats);
    expect(result.totalInvested).toBe(1500);
    expect(result.realizedPnl).toBe(150);
    expect(result.unrealizedPnl).toBe(300);
    expect(result.dividends).toBe(75);
    expect(result.totalPnl).toBe(525);
  });
});

describe('computePortfolioSummary', () => {
  it('returns zeros for empty holdings', () => {
    const result = computePortfolioSummary([], 0, 0, 0);
    expect(result.totalCost).toBe(0);
    expect(result.totalValue).toBe(0);
    expect(result.totalReturnPct).toBe(0);
  });

  it('computes correct summary values', () => {
    const holdings = [
      makeHolding({ symbol: 'A', totalCostBasisEur: 1000, currentValueEur: 1200, unrealizedPnlEur: 200 }),
      makeHolding({ symbol: 'B', totalCostBasisEur: 500, currentValueEur: 400, unrealizedPnlEur: -100 }),
    ];
    const result = computePortfolioSummary(holdings, 150, 50, 20);
    expect(result.totalCost).toBe(1500);
    expect(result.totalValue).toBe(1600);
    expect(result.unrealizedPnl).toBe(100);
    expect(result.totalRealizedPnl).toBe(150);
    expect(result.totalDividends).toBe(50);
    expect(result.totalInterest).toBe(20);
    expect(result.totalIncome).toBe(70);
    // totalReturn = 100 + 150 + 70 = 320
    expect(result.totalReturn).toBe(320);
    // totalReturnPct = (320 / 1500) * 100 ≈ 21.33
    expect(result.totalReturnPct).toBeCloseTo(21.33, 1);
  });

  it('handles zero cost basis without division by zero', () => {
    const result = computePortfolioSummary([], 100, 50, 0);
    expect(result.totalReturnPct).toBe(0);
  });
});

describe('computeDividendsByStock', () => {
  it('returns empty array for no dividends', () => {
    expect(computeDividendsByStock([])).toEqual([]);
  });

  it('aggregates multiple dividends for same symbol', () => {
    const divs = [
      makeDividend({ symbol: 'TEST', amountEur: 30 }),
      makeDividend({ symbol: 'TEST', amountEur: 20 }),
    ];
    const result = computeDividendsByStock(divs);
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('TEST');
    expect(result[0].count).toBe(2);
    expect(result[0].totalEur).toBe(50);
  });

  it('sorts by totalEur descending', () => {
    const divs = [
      makeDividend({ symbol: 'LOW', amountEur: 10 }),
      makeDividend({ symbol: 'HIGH', amountEur: 100 }),
    ];
    const result = computeDividendsByStock(divs);
    expect(result[0].symbol).toBe('HIGH');
    expect(result[1].symbol).toBe('LOW');
  });

  it('rounds totalEur to 2 decimals', () => {
    const divs = [
      makeDividend({ symbol: 'TEST', amountEur: 10.333 }),
      makeDividend({ symbol: 'TEST', amountEur: 10.333 }),
    ];
    const result = computeDividendsByStock(divs);
    expect(result[0].totalEur).toBe(20.67);
  });
});

describe('computeRealizedTradeSummary', () => {
  it('returns zeros for no trades', () => {
    const result = computeRealizedTradeSummary([]);
    expect(result).toEqual({ totalPnl: 0, shortTermPnl: 0, longTermPnl: 0, shortTermCount: 0, longTermCount: 0 });
  });

  it('separates short-term and long-term trades', () => {
    const trades = [
      makeRealizedTrade({ symbol: 'A', realizedPnlEur: 100, holdPeriod: 'short-term' }),
      makeRealizedTrade({ symbol: 'B', realizedPnlEur: 200, holdPeriod: 'long-term' }),
      makeRealizedTrade({ symbol: 'C', realizedPnlEur: -50, holdPeriod: 'short-term' }),
    ];
    const result = computeRealizedTradeSummary(trades);
    expect(result.totalPnl).toBe(250);
    expect(result.shortTermPnl).toBe(50);
    expect(result.longTermPnl).toBe(200);
    expect(result.shortTermCount).toBe(2);
    expect(result.longTermCount).toBe(1);
  });
});

describe('computeRsuByYearWithCumulative', () => {
  it('returns empty for empty input', () => {
    expect(computeRsuByYearWithCumulative([])).toEqual([]);
  });

  it('single year: cumulative equals that year', () => {
    const result = computeRsuByYearWithCumulative([
      { year: 2024, totalShares: 10, totalCompensation: 1000, totalCompensationEur: 900 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].cumulativeUsd).toBe(1000);
    expect(result[0].cumulativeEur).toBe(900);
  });

  it('multiple years: cumulative accumulates correctly', () => {
    const result = computeRsuByYearWithCumulative([
      { year: 2023, totalShares: 10, totalCompensation: 1000, totalCompensationEur: 900 },
      { year: 2024, totalShares: 20, totalCompensation: 2000, totalCompensationEur: 1800 },
      { year: 2025, totalShares: 15, totalCompensation: 1500, totalCompensationEur: 1350 },
    ]);
    expect(result[0].cumulativeUsd).toBe(1000);
    expect(result[0].cumulativeEur).toBe(900);
    expect(result[1].cumulativeUsd).toBe(3000);
    expect(result[1].cumulativeEur).toBe(2700);
    expect(result[2].cumulativeUsd).toBe(4500);
    expect(result[2].cumulativeEur).toBe(4050);
  });

  it('preserves original year data', () => {
    const result = computeRsuByYearWithCumulative([
      { year: 2024, totalShares: 10, totalCompensation: 1000, totalCompensationEur: 900 },
    ]);
    expect(result[0].year).toBe(2024);
    expect(result[0].totalShares).toBe(10);
    expect(result[0].totalCompensation).toBe(1000);
    expect(result[0].totalCompensationEur).toBe(900);
  });
});
