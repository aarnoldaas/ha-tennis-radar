import { describe, it, expect } from 'vitest';
import { computeHoldings } from '../holdings.js';
import type { ITransaction, Broker, TransactionType } from '../types.js';

function makeTxn(overrides: Partial<ITransaction> & { symbol: string; type: TransactionType; quantity: number; pricePerUnit: number; date: string }): ITransaction {
  return {
    id: `txn-${Math.random().toString(36).slice(2, 8)}`,
    broker: 'swedbank' as Broker,
    description: '',
    amount: Math.abs(overrides.quantity * overrides.pricePerUnit),
    currency: 'EUR',
    fees: 0,
    amountInBaseCurrency: Math.abs(overrides.quantity * overrides.pricePerUnit),
    ...overrides,
  };
}

describe('computeHoldings — FIFO lot tracking', () => {
  it('creates a holding from a single BUY', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 100, pricePerUnit: 10, date: '2024-01-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].symbol).toBe('TEST');
    expect(holdings[0].totalQuantity).toBe(100);
    expect(holdings[0].totalCostBasis).toBe(1000);
    expect(holdings[0].averageCostBasis).toBe(10);
  });

  it('consumes lots in FIFO order on SELL', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 50, pricePerUnit: 10, date: '2024-01-01' }),
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 50, pricePerUnit: 20, date: '2024-02-01' }),
      makeTxn({ symbol: 'TEST', type: 'SELL', quantity: -30, pricePerUnit: 25, date: '2024-03-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings).toHaveLength(1);
    // After selling 30: lot1 has 20 remaining @10, lot2 has 50 @20
    expect(holdings[0].totalQuantity).toBe(70);
    const expectedCost = 20 * 10 + 50 * 20; // 200 + 1000 = 1200
    expect(holdings[0].totalCostBasis).toBe(expectedCost);
  });

  it('removes fully consumed lots', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 30, pricePerUnit: 10, date: '2024-01-01' }),
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 70, pricePerUnit: 15, date: '2024-02-01' }),
      makeTxn({ symbol: 'TEST', type: 'SELL', quantity: -30, pricePerUnit: 20, date: '2024-03-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings[0].lots).toHaveLength(1); // first lot fully consumed
    expect(holdings[0].lots[0].remainingQuantity).toBe(70);
  });

  it('returns empty when all shares sold', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 100, pricePerUnit: 10, date: '2024-01-01' }),
      makeTxn({ symbol: 'TEST', type: 'SELL', quantity: -100, pricePerUnit: 15, date: '2024-03-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings).toHaveLength(0);
  });

  it('handles multiple symbols independently', async () => {
    const txns = [
      makeTxn({ symbol: 'AAA', type: 'BUY', quantity: 100, pricePerUnit: 10, date: '2024-01-01' }),
      makeTxn({ symbol: 'BBB', type: 'BUY', quantity: 50, pricePerUnit: 20, date: '2024-01-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings).toHaveLength(2);
    const aaa = holdings.find(h => h.symbol === 'AAA')!;
    const bbb = holdings.find(h => h.symbol === 'BBB')!;
    expect(aaa.totalQuantity).toBe(100);
    expect(bbb.totalQuantity).toBe(50);
  });

  it('handles RSU_VEST as a buy', async () => {
    const txns = [
      makeTxn({ symbol: 'WIX', type: 'RSU_VEST', quantity: 10, pricePerUnit: 150, date: '2024-01-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].totalQuantity).toBe(10);
    expect(holdings[0].lots[0].source).toBe('RSU');
  });

  it('handles ESPP_PURCHASE as a buy', async () => {
    const txns = [
      makeTxn({ symbol: 'WIX', type: 'ESPP_PURCHASE', quantity: 5, pricePerUnit: 120, date: '2024-01-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].lots[0].source).toBe('ESPP');
  });

  it('handles CRYPTO_SELL like SELL', async () => {
    const txns = [
      makeTxn({ symbol: 'BTC', type: 'BUY', quantity: 1, pricePerUnit: 30000, date: '2024-01-01' }),
      makeTxn({ symbol: 'BTC', type: 'CRYPTO_SELL', quantity: -0.5, pricePerUnit: 40000, date: '2024-06-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings[0].totalQuantity).toBe(0.5);
  });

  it('ignores non-trade transaction types', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 100, pricePerUnit: 10, date: '2024-01-01' }),
      makeTxn({ symbol: 'TEST', type: 'DIVIDEND', quantity: 0, pricePerUnit: 0, date: '2024-06-01' }),
      makeTxn({ symbol: '', type: 'FEE', quantity: 0, pricePerUnit: 0, date: '2024-06-01' }),
      makeTxn({ symbol: '', type: 'TAX', quantity: 0, pricePerUnit: 0, date: '2024-06-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].totalQuantity).toBe(100);
  });

  it('sorts transactions by date before processing', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'SELL', quantity: -50, pricePerUnit: 15, date: '2024-03-01' }),
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 100, pricePerUnit: 10, date: '2024-01-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings[0].totalQuantity).toBe(50);
  });

  it('sell with no matching lots is silently skipped', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'SELL', quantity: -50, pricePerUnit: 15, date: '2024-03-01' }),
    ];
    const { holdings } = await computeHoldings(txns);
    expect(holdings).toHaveLength(0);
  });
});

describe('computeHoldings — realized trades', () => {
  it('captures realized trade on SELL', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 100, pricePerUnit: 10, date: '2024-01-01' }),
      makeTxn({ symbol: 'TEST', type: 'SELL', quantity: -50, pricePerUnit: 15, date: '2024-06-01' }),
    ];
    const { realizedTrades } = await computeHoldings(txns);
    expect(realizedTrades).toHaveLength(1);
    expect(realizedTrades[0].symbol).toBe('TEST');
    expect(realizedTrades[0].quantity).toBe(50);
    expect(realizedTrades[0].proceeds).toBe(750); // 50 * 15
    expect(realizedTrades[0].totalCostBasis).toBe(500); // 50 * 10
    expect(realizedTrades[0].realizedPnl).toBe(250); // 750 - 500
    expect(realizedTrades[0].holdPeriod).toBe('short-term'); // < 1 year
  });

  it('classifies long-term hold correctly', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 100, pricePerUnit: 10, date: '2023-01-01' }),
      makeTxn({ symbol: 'TEST', type: 'SELL', quantity: -50, pricePerUnit: 15, date: '2024-06-01' }),
    ];
    const { realizedTrades } = await computeHoldings(txns);
    expect(realizedTrades[0].holdPeriod).toBe('long-term');
  });

  it('deducts fees from realized P&L', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 100, pricePerUnit: 10, date: '2024-01-01' }),
      makeTxn({ symbol: 'TEST', type: 'SELL', quantity: -100, pricePerUnit: 15, date: '2024-06-01', fees: 10 }),
    ];
    const { realizedTrades } = await computeHoldings(txns);
    expect(realizedTrades[0].realizedPnl).toBe(490); // (100*15) - (100*10) - 10
  });

  it('tracks lots consumed from multiple buys (FIFO)', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 30, pricePerUnit: 10, date: '2024-01-01' }),
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 70, pricePerUnit: 20, date: '2024-02-01' }),
      makeTxn({ symbol: 'TEST', type: 'SELL', quantity: -50, pricePerUnit: 25, date: '2024-06-01' }),
    ];
    const { realizedTrades } = await computeHoldings(txns);
    expect(realizedTrades[0].lotsConsumed).toHaveLength(2);
    expect(realizedTrades[0].lotsConsumed[0].quantityUsed).toBe(30); // all of first lot
    expect(realizedTrades[0].lotsConsumed[1].quantityUsed).toBe(20); // partial second lot
    // Cost: 30*10 + 20*20 = 300 + 400 = 700
    expect(realizedTrades[0].totalCostBasis).toBe(700);
    // Proceeds: 50*25 = 1250
    expect(realizedTrades[0].proceeds).toBe(1250);
    expect(realizedTrades[0].realizedPnl).toBe(550);
  });

  it('returns no realized trades when no sells', async () => {
    const txns = [
      makeTxn({ symbol: 'TEST', type: 'BUY', quantity: 100, pricePerUnit: 10, date: '2024-01-01' }),
    ];
    const { realizedTrades } = await computeHoldings(txns);
    expect(realizedTrades).toHaveLength(0);
  });
});
