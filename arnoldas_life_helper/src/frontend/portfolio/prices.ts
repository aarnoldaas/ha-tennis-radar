// Hardcoded current prices — update manually when rebuilding
// Last updated: 2026-03-25

export const CURRENT_PRICES: Record<string, { price: number; currency: string }> = {
  // Lithuanian stocks (Swedbank)
  'APG1L':   { price: 3.66, currency: 'EUR' },   // Apranga
  'IGN1L':   { price: 22.10, currency: 'EUR' },  // Ignitis
  'TEL1L':   { price: 2.06, currency: 'EUR' },   // Telia Lietuva
  'KNF1L':   { price: 0.233, currency: 'EUR' },  // Kn filter

  // IB — EUR
  'ASML':    { price: 810.0, currency: 'EUR' },   // ASML
  'E3G1':    { price: 71.0, currency: 'EUR' },    // Evolution AB
  'EVO':     { price: 71.0, currency: 'EUR' },    // Evolution AB (alias)

  // IB — DKK
  'NOVOBc':  { price: 420.0, currency: 'DKK' },   // Novo Nordisk

  // IB — CNH
  '002594':  { price: 360.0, currency: 'CNH' },   // BYD
  '89988':   { price: 158.0, currency: 'CNH' },   // Alibaba HK

  // IB & Revolut — USD
  'BABA':    { price: 175.0, currency: 'USD' },   // Alibaba ADR
  'NOMD':    { price: 12.90, currency: 'USD' },   // Nomad Foods

  // WIX
  'WIX':     { price: 73.0, currency: 'USD' },

  // Revolut crypto
  'BTC':     { price: 87000, currency: 'USD' },
  'XRP':     { price: 0.60, currency: 'USD' },

  // Swedbank — sold positions (keep for historical P&L)
  'DCX':     { price: 68.0, currency: 'EUR' },    // Mercedes-Benz
  'NHCBHFFT': { price: 0.80, currency: 'EUR' },   // Nasdaq Helsinki ETF
};
