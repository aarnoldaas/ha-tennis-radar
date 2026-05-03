import { describe, it, expect } from 'vitest';
import { classifySwedbankTransaction } from '../swedbank-parser.js';
import type { ISwedBankTransaction } from '../types.js';

function makeRaw(overrides: Partial<ISwedBankTransaction>): ISwedBankTransaction {
  return {
    accountNo: 'LT977300010172883835',
    rowType: '20',
    date: '2024-06-01',
    beneficiary: '',
    details: '',
    amount: 100,
    currency: 'EUR',
    debitCredit: 'D',
    recordId: 'REC-001',
    code: 'M',
    referenceNo: '',
    docNo: '',
    ...overrides,
  };
}

describe('classifySwedbankTransaction', () => {
  it('classifies stock buy (+ direction)', () => {
    const raw = makeRaw({
      code: 'M',
      details: 'APG1L +250@1.9/SE:4361 VSE',
      amount: 475,
      debitCredit: 'D',
    });
    const result = classifySwedbankTransaction(raw);
    expect(result.type).toBe('BUY');
    expect(result.symbol).toBe('APG1L');
    expect(result.quantity).toBe(250);
    expect(result.pricePerUnit).toBe(1.9);
  });

  it('classifies stock sell (- direction)', () => {
    const raw = makeRaw({
      code: 'M',
      details: 'IGN1L -100@5.5/SE:1234 VSE',
      amount: 550,
      debitCredit: 'K',
    });
    const result = classifySwedbankTransaction(raw);
    expect(result.type).toBe('SELL');
    expect(result.symbol).toBe('IGN1L');
    expect(result.quantity).toBe(-100);
    expect(result.pricePerUnit).toBe(5.5);
  });

  it('normalizes ticker aliases (NOVC-GY → NOV-GY)', () => {
    const raw = makeRaw({
      code: 'M',
      details: 'NOVC-GY +10@50/SE:999 VSE',
      amount: 500,
      debitCredit: 'D',
    });
    const result = classifySwedbankTransaction(raw);
    expect(result.symbol).toBe('NOV-GY');
  });

  it('classifies dividend with new format', () => {
    const raw = makeRaw({
      code: 'MK',
      details: 'DIVIDENDAI / Ignitis grupe AB / LT0000115768 / 0.581 EUR/VNT',
      amount: 58.1,
      debitCredit: 'K',
    });
    const result = classifySwedbankTransaction(raw);
    expect(result.type).toBe('DIVIDEND');
    expect(result.symbol).toBe('IGN1L');
    expect(result.pricePerUnit).toBeCloseTo(0.581);
  });

  it('classifies dividend with old format', () => {
    const raw = makeRaw({
      code: 'MK',
      details: 'DIVIDENDAI Uz VP ISIN APG1L ISIN LT0000102337, 0.08 EUR/VNT',
      amount: 20,
      debitCredit: 'K',
    });
    const result = classifySwedbankTransaction(raw);
    expect(result.type).toBe('DIVIDEND');
    expect(result.symbol).toBe('APG1L');
  });

  it('classifies trade tax', () => {
    const raw = makeRaw({
      code: 'TT',
      details: 'K: APG1L +100@2.0/SE:999',
      amount: 5,
      debitCredit: 'D',
    });
    const result = classifySwedbankTransaction(raw);
    expect(result.type).toBe('TAX');
    expect(result.symbol).toBe('APG1L');
  });

  it('classifies transfer', () => {
    const raw = makeRaw({
      code: 'MK',
      details: 'Pervedimas tarp savo saskaitu',
      amount: 1000,
      debitCredit: 'D',
    });
    const result = classifySwedbankTransaction(raw);
    expect(result.type).toBe('TRANSFER');
    expect(result.symbol).toBe('');
  });

  it('classifies custody fee', () => {
    // Regex /^VP s..skaita/ expects 2 wildcard chars between 's' and 'skaita'
    const raw = makeRaw({
      code: 'M',
      details: 'VP sxxskaita mokestis',
      amount: 2.5,
      debitCredit: 'D',
    });
    const result = classifySwedbankTransaction(raw);
    expect(result.type).toBe('FEE');
  });

  it('falls back to TRANSFER for unrecognized patterns', () => {
    const raw = makeRaw({
      code: 'M',
      details: 'Something completely unrecognized',
      amount: 100,
    });
    const result = classifySwedbankTransaction(raw);
    expect(result.type).toBe('TRANSFER');
  });

  it('uses foreign currency for specific tickers', () => {
    const raw = makeRaw({
      code: 'M',
      details: '002594 +10@200/SE:999 SZE',
      amount: 2000,
      debitCredit: 'D',
    });
    const result = classifySwedbankTransaction(raw);
    expect(result.type).toBe('BUY');
    expect(result.symbol).toBe('002594');
    expect(result.currency).toBe('CNH');
  });

  it('preserves raw data', () => {
    const raw = makeRaw({ code: 'M', details: 'APG1L +10@1.9/SE:1 VSE' });
    const result = classifySwedbankTransaction(raw);
    expect(result.raw).toBeDefined();
    expect((result.raw as any).debitCredit).toBe('D');
  });
});
