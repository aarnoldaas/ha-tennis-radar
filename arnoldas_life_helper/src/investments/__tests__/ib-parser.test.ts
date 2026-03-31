import { describe, it, expect } from 'vitest';
import { classifyIBTransactions } from '../ib-parser.js';
import type { IInteractiveBrokersTransaction } from '../types.js';

function makeIBTxn(overrides: Partial<IInteractiveBrokersTransaction>): IInteractiveBrokersTransaction {
  return {
    clientAccountId: 'U1234567',
    currencyPrimary: 'EUR',
    fxRateToBase: 1,
    assetClass: 'STK',
    subCategory: '',
    symbol: 'TEST',
    description: 'Test Stock',
    isin: '',
    listingExchange: '',
    tradeId: `T${Math.random().toString(36).slice(2, 8)}`,
    tradeDate: '06/01/2024',
    dateTime: '06/01/2024;120000',
    quantity: 100,
    tradePrice: 10,
    tradeMoney: 1000,
    proceeds: -1000,
    taxes: 0,
    ibCommission: -1,
    ibCommissionCurrency: 'EUR',
    netCash: -1001,
    closePrice: 10,
    openCloseIndicator: 'O',
    costBasis: 1000,
    fifoPnlRealized: 0,
    mtmPnl: 0,
    buySell: 'BUY',
    ...overrides,
  };
}

describe('classifyIBTransactions', () => {
  it('skips CASH (forex) transactions', () => {
    const txns = [
      makeIBTxn({ assetClass: 'CASH', symbol: 'EUR.USD' }),
    ];
    const result = classifyIBTransactions(txns);
    expect(result).toHaveLength(0);
  });

  it('classifies BUY transaction', () => {
    const txns = [
      makeIBTxn({
        buySell: 'BUY',
        symbol: 'GOOG',
        quantity: 10,
        tradePrice: 150,
        tradeMoney: 1500,
        currencyPrimary: 'USD',
        fxRateToBase: 0.9,
        tradeDate: '03/15/2024',
      }),
    ];
    const result = classifyIBTransactions(txns);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('BUY');
    expect(result[0].symbol).toBe('GOOG');
    expect(result[0].quantity).toBe(10);
    expect(result[0].pricePerUnit).toBe(150);
    expect(result[0].date).toBe('2024-03-15');
  });

  it('classifies SELL transaction', () => {
    const txns = [
      makeIBTxn({
        buySell: 'SELL',
        symbol: 'GOOG',
        quantity: -5,
        tradePrice: 160,
        tradeMoney: -800,
        proceeds: 800,
      }),
    ];
    const result = classifyIBTransactions(txns);
    expect(result[0].type).toBe('SELL');
    expect(result[0].quantity).toBe(-5);
  });

  it('calculates fees from commission + taxes', () => {
    const txns = [
      makeIBTxn({ ibCommission: -2.5, taxes: -0.5 }),
    ];
    const result = classifyIBTransactions(txns);
    expect(result[0].fees).toBe(3); // |−2.5| + |−0.5|
  });

  it('uses direct amount for EUR transactions', () => {
    const txns = [
      makeIBTxn({
        currencyPrimary: 'EUR',
        tradeMoney: 500,
        fxRateToBase: 1,
      }),
    ];
    const result = classifyIBTransactions(txns);
    expect(result[0].amountInBaseCurrency).toBe(500);
  });

  it('uses fxRateToBase for non-EUR transactions', () => {
    const txns = [
      makeIBTxn({
        currencyPrimary: 'USD',
        tradeMoney: 1000,
        fxRateToBase: 0.85,
      }),
    ];
    const result = classifyIBTransactions(txns);
    expect(result[0].amountInBaseCurrency).toBe(850); // 1000 * 0.85
  });

  it('parses IB date format correctly', () => {
    const txns = [
      makeIBTxn({ tradeDate: '12/31/2023' }),
    ];
    const result = classifyIBTransactions(txns);
    expect(result[0].date).toBe('2023-12-31');
  });

  it('creates unique IDs with ib- prefix', () => {
    const txns = [
      makeIBTxn({ tradeId: 'ABC123' }),
    ];
    const result = classifyIBTransactions(txns);
    expect(result[0].id).toBe('ib-ABC123');
  });
});
