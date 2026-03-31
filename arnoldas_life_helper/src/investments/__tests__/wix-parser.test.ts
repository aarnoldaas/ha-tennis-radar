import { describe, it, expect } from 'vitest';
import { classifyWixTransactions, type WixParsedData } from '../wix-parser.js';
import type { IWixShareIssued, IWixShareSold } from '../types.js';

function makeIssued(overrides: Partial<IWixShareIssued>): IWixShareIssued {
  return {
    grantDate: '01/03/2022',
    grantId: '9637',
    type: 'RSU',
    vestingDate: '01/06/2024',
    shares: 10,
    fmv: 150,
    costBasisPerShare: 0,
    ...overrides,
  };
}

function makeSold(overrides: Partial<IWixShareSold>): IWixShareSold {
  return {
    transactionId: 'TXN001',
    saleType: 'Sell of Restricted Stock',
    grantId: '9637',
    grantDate: '01/03/2022',
    equityType: 'RSU',
    saleDate: '01/06/2024',
    shares: 10,
    salePricePerShare: 160,
    costBasisPerShare: 0,
    fees: 5,
    ...overrides,
  };
}

function makeData(issued: IWixShareIssued[] = [], sold: IWixShareSold[] = []): WixParsedData {
  return { issued, sold };
}

describe('classifyWixTransactions', () => {
  it('returns empty for empty data', () => {
    const result = classifyWixTransactions(makeData());
    expect(result).toHaveLength(0);
  });

  it('classifies RSU vest with FMV as price', () => {
    const result = classifyWixTransactions(makeData([makeIssued({ type: 'RSU', fmv: 150, costBasisPerShare: 0, shares: 10 })]));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('RSU_VEST');
    expect(result[0].symbol).toBe('WIX');
    expect(result[0].pricePerUnit).toBe(150);
    expect(result[0].quantity).toBe(10);
    expect(result[0].amount).toBe(1500); // 10 * 150
    expect(result[0].currency).toBe('USD');
  });

  it('classifies ESPP purchase with cost basis as price', () => {
    const result = classifyWixTransactions(makeData([makeIssued({ type: 'ESPP', fmv: 100, costBasisPerShare: 80, shares: 5, grantId: 'ESPP13749' })]));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ESPP_PURCHASE');
    expect(result[0].pricePerUnit).toBe(80);
    expect(result[0].amount).toBe(400); // 5 * 80
  });

  it('classifies sell with negative quantity', () => {
    const result = classifyWixTransactions(makeData([], [makeSold({ shares: 10, salePricePerShare: 160, fees: 5 })]));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('SELL');
    expect(result[0].quantity).toBe(-10);
    expect(result[0].pricePerUnit).toBe(160);
    expect(result[0].fees).toBe(5);
  });

  it('handles mixed issued + sold transactions', () => {
    const data = makeData(
      [makeIssued({ type: 'RSU', shares: 20 })],
      [makeSold({ shares: 10 })],
    );
    const result = classifyWixTransactions(data);
    expect(result).toHaveLength(2);
    expect(result.find(t => t.type === 'RSU_VEST')).toBeDefined();
    expect(result.find(t => t.type === 'SELL')).toBeDefined();
  });

  it('converts amounts to EUR base currency', () => {
    const result = classifyWixTransactions(makeData([makeIssued({ shares: 10, fmv: 100 })]));
    // amountInBaseCurrency should be converted from USD to EUR
    expect(result[0].amountInBaseCurrency).toBeGreaterThan(0);
    expect(result[0].amountInBaseCurrency).not.toBe(result[0].amount); // USD ≠ EUR
  });

  it('preserves raw data with grantId', () => {
    const result = classifyWixTransactions(makeData([makeIssued({ grantId: '9637' })]));
    expect((result[0].raw as any).grantId).toBe('9637');
  });

  it('sets broker to wix', () => {
    const result = classifyWixTransactions(makeData([makeIssued()]));
    expect(result[0].broker).toBe('wix');
  });
});
