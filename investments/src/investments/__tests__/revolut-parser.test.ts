import { describe, it, expect } from 'vitest';
import { classifyRevolutTransactions, type RevolutParsedData } from '../revolut-parser.js';
import type { IRevolutBrokerageSell, IRevolutCryptoSell } from '../types.js';

const EMPTY_SUMMARY = {
  flexibleCashEur: 0,
  flexibleCashUsd: 0,
  savingsEur: 0,
  savingsUsd: 0,
  totalEur: 0,
};

function makeBrokerage(overrides: Partial<IRevolutBrokerageSell>): IRevolutBrokerageSell {
  return {
    dateAcquired: 'Jan 15, 2024',
    dateSold: 'Jun 01, 2024',
    securityName: 'Test Stock',
    symbol: 'TEST',
    isin: 'US0000000000',
    country: 'US',
    quantity: 10,
    costBasis: 100,
    costBasisBaseCurrency: 90,
    costBasisRate: 0.9,
    grossProceeds: 150,
    grossProceedsBaseCurrency: 135,
    grossProceedsRate: 0.9,
    grossPnl: 50,
    grossPnlBaseCurrency: 45,
    fees: 2,
    feesBaseCurrency: 1.8,
    currency: 'USD',
    ...overrides,
  };
}

function makeCrypto(overrides: Partial<IRevolutCryptoSell>): IRevolutCryptoSell {
  return {
    dateAcquired: 'Mar 10, 2023',
    dateSold: 'Jul 15, 2024',
    tokenName: 'BTC',
    quantity: 0.5,
    costBasis: 15000,
    grossProceeds: 20000,
    grossPnl: 5000,
    ...overrides,
  };
}

function makeData(overrides: Partial<RevolutParsedData> = {}): RevolutParsedData {
  return {
    brokerageEur: [],
    brokerageUsd: [],
    crypto: [],
    interestSummary: EMPTY_SUMMARY,
    ...overrides,
  };
}

describe('classifyRevolutTransactions', () => {
  it('returns empty for empty data', () => {
    const result = classifyRevolutTransactions(makeData());
    expect(result).toHaveLength(0);
  });

  it('creates synthetic BUY + SELL pair for brokerage sell', () => {
    const data = makeData({
      brokerageUsd: [makeBrokerage({ symbol: 'GOOG', quantity: 10, costBasis: 1000, grossProceeds: 1500 })],
    });
    const result = classifyRevolutTransactions(data);
    expect(result).toHaveLength(2);
    const buy = result.find(t => t.type === 'BUY')!;
    const sell = result.find(t => t.type === 'SELL')!;
    expect(buy).toBeDefined();
    expect(sell).toBeDefined();
    expect(buy.symbol).toBe('GOOG');
    expect(sell.symbol).toBe('GOOG');
    expect(buy.quantity).toBe(10);
    expect(sell.quantity).toBe(-10);
  });

  it('uses dateAcquired for BUY and dateSold for SELL', () => {
    const data = makeData({
      brokerageEur: [makeBrokerage({
        dateAcquired: 'Jan 15, 2024',
        dateSold: 'Jun 01, 2024',
        currency: 'EUR',
      })],
    });
    const result = classifyRevolutTransactions(data);
    const buy = result.find(t => t.type === 'BUY')!;
    const sell = result.find(t => t.type === 'SELL')!;
    expect(buy.date).toBe('2024-01-15');
    expect(sell.date).toBe('2024-06-01');
  });

  it('preserves fees on sell transactions', () => {
    const data = makeData({
      brokerageUsd: [makeBrokerage({ fees: 5 })],
    });
    const result = classifyRevolutTransactions(data);
    const sell = result.find(t => t.type === 'SELL')!;
    expect(sell.fees).toBe(5);
  });

  it('creates BUY + CRYPTO_SELL pair for crypto', () => {
    const data = makeData({
      crypto: [makeCrypto({ tokenName: 'BTC', quantity: 0.5 })],
    });
    const result = classifyRevolutTransactions(data);
    expect(result).toHaveLength(2);
    const buy = result.find(t => t.type === 'BUY')!;
    const sell = result.find(t => t.type === 'CRYPTO_SELL')!;
    expect(buy.symbol).toBe('BTC');
    expect(sell.symbol).toBe('BTC');
    expect(buy.quantity).toBe(0.5);
    expect(sell.quantity).toBe(-0.5);
    expect(sell.currency).toBe('USD');
  });

  it('calculates per-unit prices from totals', () => {
    const data = makeData({
      brokerageUsd: [makeBrokerage({ quantity: 10, costBasis: 100, grossProceeds: 150 })],
    });
    const result = classifyRevolutTransactions(data);
    const buy = result.find(t => t.type === 'BUY')!;
    const sell = result.find(t => t.type === 'SELL')!;
    expect(buy.pricePerUnit).toBe(10); // 100 / 10
    expect(sell.pricePerUnit).toBe(15); // 150 / 10
  });

  it('sets broker to revolut', () => {
    const data = makeData({
      brokerageEur: [makeBrokerage({ currency: 'EUR' })],
    });
    const result = classifyRevolutTransactions(data);
    expect(result[0].broker).toBe('revolut');
  });

  it('handles EUR brokerage with base currency amounts', () => {
    const data = makeData({
      brokerageEur: [makeBrokerage({
        currency: 'EUR',
        costBasis: 100,
        costBasisBaseCurrency: 100,
        grossProceeds: 150,
        grossProceedsBaseCurrency: 150,
      })],
    });
    const result = classifyRevolutTransactions(data);
    const buy = result.find(t => t.type === 'BUY')!;
    expect(buy.amountInBaseCurrency).toBe(100);
  });
});
