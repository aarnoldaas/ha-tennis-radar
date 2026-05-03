import { describe, it, expect } from 'vitest';
import { computeRsuCompensation, computeEsppSummary } from '../equity-compensation.js';
import type { ITransaction, Broker, TransactionType } from '../types.js';

function makeTxn(overrides: Partial<ITransaction> & { type: TransactionType }): ITransaction {
  return {
    id: `txn-${Math.random().toString(36).slice(2)}`,
    broker: 'wix' as Broker,
    symbol: 'WIX',
    date: '2024-06-01',
    description: '',
    quantity: 10,
    pricePerUnit: 150,
    amount: 1500,
    currency: 'USD',
    fees: 0,
    amountInBaseCurrency: 1350,
    ...overrides,
  };
}

describe('computeRsuCompensation', () => {
  it('returns zeros for no RSU transactions', () => {
    const result = computeRsuCompensation([]);
    expect(result.totalCompensation).toBe(0);
    expect(result.totalCompensationEur).toBe(0);
    expect(result.byYear).toEqual([]);
    expect(result.byGrant).toEqual([]);
  });

  it('computes single RSU vesting correctly', () => {
    const txns = [
      makeTxn({ type: 'RSU_VEST', quantity: 10, pricePerUnit: 100, raw: { grantId: '1234' } }),
    ];
    const result = computeRsuCompensation(txns);
    expect(result.totalCompensation).toBe(1000); // 10 * 100
    expect(result.totalCompensationEur).toBeGreaterThan(0);
    expect(result.byGrant).toHaveLength(1);
    expect(result.byGrant[0].grantId).toBe('1234');
    expect(result.byGrant[0].totalShares).toBe(10);
  });

  it('aggregates multiple vestings by year', () => {
    const txns = [
      makeTxn({ type: 'RSU_VEST', quantity: 10, pricePerUnit: 100, date: '2023-06-01', raw: { grantId: 'A' } }),
      makeTxn({ type: 'RSU_VEST', quantity: 20, pricePerUnit: 100, date: '2024-03-01', raw: { grantId: 'A' } }),
      makeTxn({ type: 'RSU_VEST', quantity: 5, pricePerUnit: 100, date: '2024-09-01', raw: { grantId: 'B' } }),
    ];
    const result = computeRsuCompensation(txns);
    expect(result.byYear).toHaveLength(2);
    const y2023 = result.byYear.find(y => y.year === 2023);
    const y2024 = result.byYear.find(y => y.year === 2024);
    expect(y2023!.totalShares).toBe(10);
    expect(y2024!.totalShares).toBe(25);
  });

  it('aggregates by grant', () => {
    const txns = [
      makeTxn({ type: 'RSU_VEST', quantity: 10, pricePerUnit: 100, date: '2024-06-01', raw: { grantId: 'G1' } }),
      makeTxn({ type: 'RSU_VEST', quantity: 5, pricePerUnit: 120, date: '2024-09-01', raw: { grantId: 'G1' } }),
      makeTxn({ type: 'RSU_VEST', quantity: 8, pricePerUnit: 110, date: '2024-06-01', raw: { grantId: 'G2' } }),
    ];
    const result = computeRsuCompensation(txns);
    expect(result.byGrant).toHaveLength(2);
    const g1 = result.byGrant.find(g => g.grantId === 'G1')!;
    expect(g1.totalShares).toBe(15);
    expect(g1.totalCompensation).toBe(1600); // 10*100 + 5*120
  });

  it('detects same-day sale', () => {
    const txns = [
      makeTxn({ type: 'RSU_VEST', symbol: 'WIX', quantity: 10, pricePerUnit: 100, date: '2024-06-01', raw: { grantId: 'G1' } }),
      makeTxn({ type: 'SELL', symbol: 'WIX', quantity: -10, pricePerUnit: 100, date: '2024-06-01', broker: 'wix' as Broker }),
    ];
    const result = computeRsuCompensation(txns);
    expect(result.byGrant[0].vestings[0].isSameDaySale).toBe(true);
  });

  it('no same-day sale when date differs', () => {
    const txns = [
      makeTxn({ type: 'RSU_VEST', symbol: 'WIX', quantity: 10, pricePerUnit: 100, date: '2024-06-01', raw: { grantId: 'G1' } }),
      makeTxn({ type: 'SELL', symbol: 'WIX', quantity: -10, pricePerUnit: 100, date: '2024-06-02', broker: 'wix' as Broker }),
    ];
    const result = computeRsuCompensation(txns);
    expect(result.byGrant[0].vestings[0].isSameDaySale).toBe(false);
  });

  it('builds cumulative timeline in date order', () => {
    const txns = [
      makeTxn({ type: 'RSU_VEST', quantity: 10, pricePerUnit: 100, date: '2024-09-01', raw: { grantId: 'A' } }),
      makeTxn({ type: 'RSU_VEST', quantity: 5, pricePerUnit: 200, date: '2024-03-01', raw: { grantId: 'A' } }),
    ];
    const result = computeRsuCompensation(txns);
    expect(result.cumulative).toHaveLength(2);
    // Should be sorted by date: March first, then September
    expect(result.cumulative[0].date).toBe('2024-03-01');
    expect(result.cumulative[0].cumulativeCompensation).toBe(1000); // 5 * 200
    expect(result.cumulative[1].date).toBe('2024-09-01');
    expect(result.cumulative[1].cumulativeCompensation).toBe(2000); // 1000 + 10*100
  });

  it('uses "unknown" as grantId fallback', () => {
    const txns = [
      makeTxn({ type: 'RSU_VEST', quantity: 10, pricePerUnit: 100, raw: undefined }),
    ];
    const result = computeRsuCompensation(txns);
    expect(result.byGrant[0].grantId).toBe('unknown');
  });

  it('ignores non-RSU_VEST transactions', () => {
    const txns = [
      makeTxn({ type: 'BUY' }),
      makeTxn({ type: 'SELL' }),
      makeTxn({ type: 'DIVIDEND' }),
    ];
    const result = computeRsuCompensation(txns);
    expect(result.totalCompensation).toBe(0);
  });
});

describe('computeEsppSummary', () => {
  it('returns zeros for no ESPP transactions', () => {
    const result = computeEsppSummary([]);
    expect(result.totalSharesPurchased).toBe(0);
    expect(result.totalDiscountCaptured).toBe(0);
    expect(result.averageDiscountPercent).toBe(0);
  });

  it('computes ESPP discount correctly', () => {
    const txns = [
      makeTxn({
        type: 'ESPP_PURCHASE',
        quantity: 10,
        pricePerUnit: 80, // discounted price
        raw: { fmv: 100 }, // full market value
      }),
    ];
    const result = computeEsppSummary(txns);
    expect(result.totalSharesPurchased).toBe(10);
    expect(result.totalCostBasis).toBe(800); // 10 * 80
    expect(result.totalFmvAtPurchase).toBe(1000); // 10 * 100
    expect(result.totalDiscountCaptured).toBe(200); // 1000 - 800
    expect(result.averageDiscountPercent).toBe(20); // (200/1000)*100
  });

  it('handles multiple ESPP purchases', () => {
    const txns = [
      makeTxn({ type: 'ESPP_PURCHASE', quantity: 10, pricePerUnit: 80, raw: { fmv: 100 } }),
      makeTxn({ type: 'ESPP_PURCHASE', quantity: 20, pricePerUnit: 90, raw: { fmv: 120 } }),
    ];
    const result = computeEsppSummary(txns);
    expect(result.totalSharesPurchased).toBe(30);
    expect(result.totalCostBasis).toBe(2600); // 800 + 1800
    expect(result.totalFmvAtPurchase).toBe(3400); // 1000 + 2400
    expect(result.totalDiscountCaptured).toBe(800); // 3400 - 2600
  });

  it('falls back to pricePerUnit when fmv not in raw', () => {
    const txns = [
      makeTxn({ type: 'ESPP_PURCHASE', quantity: 10, pricePerUnit: 100, raw: {} }),
    ];
    const result = computeEsppSummary(txns);
    // fmv = pricePerUnit = 100, cost = 100, discount = 0
    expect(result.totalDiscountCaptured).toBe(0);
    expect(result.averageDiscountPercent).toBe(0);
  });

  it('ignores non-ESPP transactions', () => {
    const txns = [
      makeTxn({ type: 'BUY' }),
      makeTxn({ type: 'RSU_VEST' }),
    ];
    const result = computeEsppSummary(txns);
    expect(result.totalSharesPurchased).toBe(0);
  });
});
