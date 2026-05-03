import { describe, it, expect } from 'vitest';
import { computeAllocation, computeRiskWarnings, buildTickerMetaMap, getTickerMeta } from '../analytics.js';
import type { IHolding, Broker } from '../types.js';

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

describe('computeAllocation', () => {
  it('returns empty breakdowns for empty holdings', () => {
    const result = computeAllocation([]);
    expect(result.byGeography).toEqual([]);
    expect(result.byAssetClass).toEqual([]);
    expect(result.byCurrency).toEqual([]);
    expect(result.bySector).toEqual([]);
  });

  it('single holding: 100% allocation in all categories', () => {
    const result = computeAllocation([makeHolding({ symbol: 'APG1L', currentValueEur: 1000 })]);
    expect(result.byGeography).toHaveLength(1);
    expect(result.byGeography[0].name).toBe('Baltic');
    expect(result.byGeography[0].percent).toBe(100);
    expect(result.bySector[0].name).toBe('Utilities');
  });

  it('multiple holdings: correct percentage split', () => {
    const holdings = [
      makeHolding({ symbol: 'APG1L', currentValueEur: 750 }),
      makeHolding({ symbol: 'GOOG', currentValueEur: 250 }),
    ];
    const result = computeAllocation(holdings);
    const baltic = result.byGeography.find(e => e.name === 'Baltic');
    const us = result.byGeography.find(e => e.name === 'US');
    expect(baltic!.percent).toBe(75);
    expect(us!.percent).toBe(25);
  });

  it('entries sorted by percent descending', () => {
    const holdings = [
      makeHolding({ symbol: 'APG1L', currentValueEur: 100 }),
      makeHolding({ symbol: 'GOOG', currentValueEur: 900 }),
    ];
    const result = computeAllocation(holdings);
    expect(result.byGeography[0].name).toBe('US');
    expect(result.byGeography[1].name).toBe('Baltic');
  });

  it('uses default metadata for unknown tickers', () => {
    const result = computeAllocation([makeHolding({ symbol: 'UNKNOWN', currentValueEur: 100 })]);
    expect(result.byGeography[0].name).toBe('Other');
    expect(result.bySector[0].name).toBe('Other');
  });
});

describe('computeRiskWarnings', () => {
  it('returns no warnings for empty holdings', () => {
    expect(computeRiskWarnings([])).toEqual([]);
  });

  it('warns when single position > 20%', () => {
    const holdings = [
      makeHolding({ symbol: 'BIG', currentValueEur: 800 }),
      makeHolding({ symbol: 'SMALL', currentValueEur: 200 }),
    ];
    const result = computeRiskWarnings(holdings);
    const concWarning = result.find(w => w.type === 'concentration');
    expect(concWarning).toBeDefined();
    expect(concWarning!.message).toContain('BIG');
  });

  it('no concentration warning when positions are balanced', () => {
    const holdings = [
      makeHolding({ symbol: 'A', currentValueEur: 200 }),
      makeHolding({ symbol: 'B', currentValueEur: 200 }),
      makeHolding({ symbol: 'C', currentValueEur: 200 }),
      makeHolding({ symbol: 'D', currentValueEur: 200 }),
      makeHolding({ symbol: 'E', currentValueEur: 200 }),
    ];
    const result = computeRiskWarnings(holdings);
    expect(result.filter(w => w.type === 'concentration')).toHaveLength(0);
  });

  it('warns when single currency > 50%', () => {
    // APG1L is EUR, GOOG is USD
    const holdings = [
      makeHolding({ symbol: 'APG1L', currentValueEur: 600 }),
      makeHolding({ symbol: 'GOOG', currentValueEur: 400 }),
    ];
    const result = computeRiskWarnings(holdings);
    const currWarning = result.find(w => w.type === 'currency');
    expect(currWarning).toBeDefined();
    expect(currWarning!.message).toContain('EUR');
  });
});

describe('buildTickerMetaMap', () => {
  it('returns metadata for known tickers', () => {
    const holdings = [makeHolding({ symbol: 'APG1L' })];
    const result = buildTickerMetaMap(holdings);
    expect(result['APG1L'].geography).toBe('Baltic');
    expect(result['APG1L'].sector).toBe('Utilities');
  });

  it('returns default for unknown tickers', () => {
    const holdings = [makeHolding({ symbol: 'UNKNOWN' })];
    const result = buildTickerMetaMap(holdings);
    expect(result['UNKNOWN'].geography).toBe('Other');
    expect(result['UNKNOWN'].sector).toBe('Other');
  });
});

describe('getTickerMeta', () => {
  it('returns correct metadata for known ticker', () => {
    const meta = getTickerMeta('GOOG');
    expect(meta.geography).toBe('US');
    expect(meta.assetClass).toBe('Stocks');
    expect(meta.sector).toBe('Technology');
    expect(meta.currencyExposure).toBe('USD');
  });

  it('returns defaults for unknown ticker', () => {
    const meta = getTickerMeta('ZZZZ');
    expect(meta.geography).toBe('Other');
    expect(meta.assetClass).toBe('Stocks');
    expect(meta.sector).toBe('Other');
    expect(meta.currencyExposure).toBe('EUR');
  });
});
