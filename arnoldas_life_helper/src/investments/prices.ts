// ============================================================================
// Current Market Price — Hardcoded Stub
// ============================================================================
//
// TODO: Replace with real market data API (e.g. Yahoo Finance, Alpha Vantage).
// ============================================================================

/**
 * Hardcoded approximate current prices for known tickers.
 *
 * Prices are approximate as of March 2026.
 *
 * TODO: Replace with live market data fetch.
 */
const HARDCODED_PRICES: Record<string, { price: number; currency: string }> = {
  // Baltic stocks (Swedbank — Vilnius Stock Exchange, EUR)
  APG1L: { price: 3.60, currency: "EUR" },
  IGN1L: { price: 20.50, currency: "EUR" },
  TEL1L: { price: 2.10, currency: "EUR" },
  KNF1L: { price: 0.35, currency: "EUR" },
  SAB1L: { price: 0.80, currency: "EUR" },
  LNA1L: { price: 1.25, currency: "EUR" },
  ROE1L: { price: 0.95, currency: "EUR" },

  // EU stocks (Interactive Brokers, EUR)
  ASML: { price: 680.00, currency: "EUR" },

  // US/HK stocks (Interactive Brokers, USD)
  BABA: { price: 175.00, currency: "USD" },
  WIX: { price: 210.00, currency: "USD" },
  "002594": { price: 360.00, currency: "CNH" }, // BYD

  // Revolut brokerage
  E3G1: { price: 72.00, currency: "EUR" }, // Evolution AB
};

/**
 * Get the current market price for a ticker.
 *
 * @param ticker    The ticker symbol
 * @param currency  Expected currency (used as hint; returned price may differ)
 * @returns         Current price per share and its currency, or null if unknown
 *
 * TODO: Replace with real market data API.
 */
export function getCurrentPrice(
  ticker: string,
  currency?: string,
): { price: number; currency: string } | null {
  const entry = HARDCODED_PRICES[ticker];
  if (entry) return entry;

  // If not in the hardcoded table, return null — caller must handle
  console.warn(`No hardcoded price for ticker "${ticker}"`);
  return null;
}
