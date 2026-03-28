import { describe, it, expect } from 'vitest';
import { getExchangeRate, convertAmount } from '../currency.js';

describe('getExchangeRate', () => {
  it('returns 1 for identity conversion', () => {
    expect(getExchangeRate('2024-01-01', 'EUR', 'EUR')).toBe(1);
    expect(getExchangeRate('2024-01-01', 'USD', 'USD')).toBe(1);
  });

  it('returns a rate for EUR→USD', () => {
    const rate = getExchangeRate('2024-01-01', 'EUR', 'USD');
    expect(rate).toBeGreaterThan(0.8);
    expect(rate).toBeLessThan(1.5);
  });

  it('USD→EUR is approximately the inverse of EUR→USD', () => {
    const eurToUsd = getExchangeRate('2024-01-01', 'EUR', 'USD');
    const usdToEur = getExchangeRate('2024-01-01', 'USD', 'EUR');
    expect(eurToUsd * usdToEur).toBeCloseTo(1, 4);
  });

  it('handles CNH→EUR via USD proxy', () => {
    const rate = getExchangeRate('2024-01-01', 'CNH', 'EUR');
    // CNH is ~7 per USD, USD ~0.9 per EUR, so CNH→EUR should be ~0.12-0.15
    expect(rate).toBeGreaterThan(0.05);
    expect(rate).toBeLessThan(0.3);
  });

  it('handles DKK→EUR', () => {
    const rate = getExchangeRate('2024-01-01', 'DKK', 'EUR');
    // DKK pegged to EUR at ~7.46 DKK/EUR, so DKK→EUR ≈ 0.134
    expect(rate).toBeCloseTo(0.1341, 3);
  });

  it('returns 1 for unknown currency pair with warning', () => {
    const rate = getExchangeRate('2024-01-01', 'XYZ', 'ABC');
    expect(rate).toBe(1);
  });
});

describe('convertAmount', () => {
  it('converts USD to EUR', () => {
    const result = convertAmount(100, '2024-01-01', 'USD', 'EUR');
    // With rate around 1.1 EUR/USD, 100 USD ≈ 90 EUR
    expect(result).toBeGreaterThan(70);
    expect(result).toBeLessThan(130);
  });

  it('returns same amount for same currency', () => {
    expect(convertAmount(100, '2024-01-01', 'EUR', 'EUR')).toBe(100);
  });

  it('handles zero amount', () => {
    expect(convertAmount(0, '2024-01-01', 'USD', 'EUR')).toBe(0);
  });
});
