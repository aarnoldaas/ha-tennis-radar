// Static FX rates (EUR as base = 1.0)
// These are approximate and can be overridden by IB's FXRateToBase per-trade
export const FX_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 0.84,
  DKK: 0.134,
  CNH: 0.12,
  HKD: 0.108,
  GBP: 1.15,
  SEK: 0.088,
};

export function getFxRate(currency: string): number {
  return FX_RATES[currency] ?? 1.0;
}

export function toEUR(amount: number, currency: string, fxRate?: number): number {
  const rate = fxRate ?? getFxRate(currency);
  return amount * rate;
}
