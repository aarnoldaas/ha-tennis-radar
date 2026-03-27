// ============================================================================
// Market Prices — Hardcoded Stub (Date-Based)
// ============================================================================
//
// TODO: Replace with real market data API (e.g. Yahoo Finance, Alpha Vantage).
// ============================================================================

interface PriceEntry {
  date: string;
  price: number;
  currency: string;
}

/**
 * Hardcoded approximate prices for known tickers, keyed by date.
 *
 * Each ticker has an array of price snapshots sorted chronologically.
 * Use `getPrice()` to look up the closest price to any given date.
 *
 * TODO: Replace with live market data fetch.
 */
const HARDCODED_PRICES: Record<string, PriceEntry[]> = {
  // ---- Baltic stocks (Swedbank — Vilnius Stock Exchange, EUR) ----
  APG1L: [
    { date: "2020-01-01", price: 2.60, currency: "EUR" },
    { date: "2021-01-01", price: 2.80, currency: "EUR" },
    { date: "2022-01-01", price: 3.00, currency: "EUR" },
    { date: "2023-01-01", price: 3.10, currency: "EUR" },
    { date: "2024-01-01", price: 3.20, currency: "EUR" },
    { date: "2025-01-01", price: 3.40, currency: "EUR" },
    { date: "2026-03-01", price: 3.60, currency: "EUR" },
  ],
  IGN1L: [
    { date: "2020-01-01", price: 8.50, currency: "EUR" },
    { date: "2021-01-01", price: 10.00, currency: "EUR" },
    { date: "2022-01-01", price: 14.00, currency: "EUR" },
    { date: "2023-01-01", price: 16.50, currency: "EUR" },
    { date: "2024-01-01", price: 18.00, currency: "EUR" },
    { date: "2025-01-01", price: 19.50, currency: "EUR" },
    { date: "2026-03-01", price: 20.50, currency: "EUR" },
  ],
  TEL1L: [
    { date: "2020-01-01", price: 1.50, currency: "EUR" },
    { date: "2021-01-01", price: 1.60, currency: "EUR" },
    { date: "2022-01-01", price: 1.75, currency: "EUR" },
    { date: "2023-01-01", price: 1.85, currency: "EUR" },
    { date: "2024-01-01", price: 1.95, currency: "EUR" },
    { date: "2025-01-01", price: 2.00, currency: "EUR" },
    { date: "2026-03-01", price: 2.10, currency: "EUR" },
  ],
  KNF1L: [
    { date: "2020-01-01", price: 0.42, currency: "EUR" },
    { date: "2021-01-01", price: 0.45, currency: "EUR" },
    { date: "2022-01-01", price: 0.40, currency: "EUR" },
    { date: "2023-01-01", price: 0.38, currency: "EUR" },
    { date: "2024-01-01", price: 0.36, currency: "EUR" },
    { date: "2025-01-01", price: 0.35, currency: "EUR" },
    { date: "2026-03-01", price: 0.35, currency: "EUR" },
  ],
  SAB1L: [
    { date: "2020-01-01", price: 0.65, currency: "EUR" },
    { date: "2021-01-01", price: 0.70, currency: "EUR" },
    { date: "2022-01-01", price: 0.72, currency: "EUR" },
    { date: "2023-01-01", price: 0.74, currency: "EUR" },
    { date: "2024-01-01", price: 0.76, currency: "EUR" },
    { date: "2025-01-01", price: 0.78, currency: "EUR" },
    { date: "2026-03-01", price: 0.80, currency: "EUR" },
  ],
  LNA1L: [
    { date: "2020-01-01", price: 0.85, currency: "EUR" },
    { date: "2021-01-01", price: 0.90, currency: "EUR" },
    { date: "2022-01-01", price: 0.95, currency: "EUR" },
    { date: "2023-01-01", price: 1.00, currency: "EUR" },
    { date: "2024-01-01", price: 1.10, currency: "EUR" },
    { date: "2025-01-01", price: 1.20, currency: "EUR" },
    { date: "2026-03-01", price: 1.25, currency: "EUR" },
  ],
  ROE1L: [
    { date: "2020-01-01", price: 0.60, currency: "EUR" },
    { date: "2021-01-01", price: 0.65, currency: "EUR" },
    { date: "2022-01-01", price: 0.70, currency: "EUR" },
    { date: "2023-01-01", price: 0.75, currency: "EUR" },
    { date: "2024-01-01", price: 0.80, currency: "EUR" },
    { date: "2025-01-01", price: 0.90, currency: "EUR" },
    { date: "2026-03-01", price: 0.95, currency: "EUR" },
  ],

  // ---- EU stocks (Interactive Brokers, EUR) ----
  ASML: [
    { date: "2020-01-01", price: 260.00, currency: "EUR" },
    { date: "2021-01-01", price: 400.00, currency: "EUR" },
    { date: "2022-01-01", price: 640.00, currency: "EUR" },
    { date: "2023-01-01", price: 500.00, currency: "EUR" },
    { date: "2024-01-01", price: 620.00, currency: "EUR" },
    { date: "2025-01-01", price: 660.00, currency: "EUR" },
    { date: "2026-03-01", price: 680.00, currency: "EUR" },
  ],

  // ---- US/HK stocks (Interactive Brokers, USD) ----
  BABA: [
    { date: "2020-01-01", price: 215.00, currency: "USD" },
    { date: "2021-01-01", price: 230.00, currency: "USD" },
    { date: "2022-01-01", price: 120.00, currency: "USD" },
    { date: "2023-01-01", price: 90.00, currency: "USD" },
    { date: "2024-01-01", price: 78.00, currency: "USD" },
    { date: "2025-01-01", price: 85.00, currency: "USD" },
    { date: "2026-03-01", price: 175.00, currency: "USD" },
  ],
  WIX: [
    { date: "2020-01-01", price: 120.00, currency: "USD" },
    { date: "2021-01-01", price: 250.00, currency: "USD" },
    { date: "2022-01-01", price: 130.00, currency: "USD" },
    { date: "2023-01-01", price: 80.00, currency: "USD" },
    { date: "2024-01-01", price: 130.00, currency: "USD" },
    { date: "2025-01-01", price: 190.00, currency: "USD" },
    { date: "2026-03-01", price: 210.00, currency: "USD" },
  ],
  "002594": [ // BYD
    { date: "2020-01-01", price: 50.00, currency: "CNH" },
    { date: "2021-01-01", price: 195.00, currency: "CNH" },
    { date: "2022-01-01", price: 270.00, currency: "CNH" },
    { date: "2023-01-01", price: 260.00, currency: "CNH" },
    { date: "2024-01-01", price: 220.00, currency: "CNH" },
    { date: "2025-01-01", price: 290.00, currency: "CNH" },
    { date: "2026-03-01", price: 360.00, currency: "CNH" },
  ],

  // ---- US stocks (Interactive Brokers, USD) ----
  GOOG: [
    { date: "2020-01-01", price: 71.18, currency: "USD" },
    { date: "2021-01-01", price: 91.10, currency: "USD" },
    { date: "2022-01-01", price: 134.69, currency: "USD" },
    { date: "2023-01-01", price: 99.13, currency: "USD" },
    { date: "2024-01-01", price: 140.74, currency: "USD" },
    { date: "2025-01-01", price: 204.80, currency: "USD" },
    { date: "2026-03-01", price: 280.74, currency: "USD" },
  ],
  NOVA: [ // Novo Nordisk (IB ticker)
    { date: "2020-01-01", price: 27.32, currency: "USD" },
    { date: "2021-01-01", price: 31.95, currency: "USD" },
    { date: "2022-01-01", price: 46.75, currency: "USD" },
    { date: "2023-01-01", price: 65.95, currency: "USD" },
    { date: "2024-01-01", price: 110.45, currency: "USD" },
    { date: "2025-01-01", price: 82.18, currency: "USD" },
    { date: "2026-03-01", price: 36.40, currency: "USD" },
  ],

  // ---- Revolut brokerage ----
  E3G1: [ // Evolution AB
    { date: "2020-01-01", price: 55.00, currency: "EUR" },
    { date: "2021-01-01", price: 95.00, currency: "EUR" },
    { date: "2022-01-01", price: 110.00, currency: "EUR" },
    { date: "2023-01-01", price: 100.00, currency: "EUR" },
    { date: "2024-01-01", price: 95.00, currency: "EUR" },
    { date: "2025-01-01", price: 80.00, currency: "EUR" },
    { date: "2026-03-01", price: 72.00, currency: "EUR" },
  ],
};

/**
 * Find the entry with the closest date to the target.
 */
function findClosestEntry(
  entries: PriceEntry[],
  targetDate: string,
): PriceEntry | undefined {
  if (entries.length === 0) return undefined;

  const target = new Date(targetDate).getTime();
  let best = entries[0];
  let bestDiff = Math.abs(new Date(best.date).getTime() - target);

  for (let i = 1; i < entries.length; i++) {
    const diff = Math.abs(new Date(entries[i].date).getTime() - target);
    if (diff < bestDiff) {
      best = entries[i];
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * Get the market price for a ticker on (or closest to) a given date.
 *
 * @param ticker  The ticker symbol
 * @param date    ISO 8601 date string (YYYY-MM-DD)
 * @returns       Price and currency, or null if the ticker is unknown
 *
 * TODO: Replace with real market data API.
 */
export function getPrice(
  ticker: string,
  date: string,
): { price: number; currency: string } | null {
  const entries = HARDCODED_PRICES[ticker];
  if (!entries) {
    console.warn(`No hardcoded price for ticker "${ticker}"`);
    return null;
  }
  const entry = findClosestEntry(entries, date);
  return entry ? { price: entry.price, currency: entry.currency } : null;
}

/**
 * Get the current market price for a ticker (uses today's date).
 *
 * @param ticker    The ticker symbol
 * @param currency  Expected currency (unused hint; kept for backwards compat)
 * @returns         Current price per share and its currency, or null if unknown
 *
 * TODO: Replace with real market data API.
 */
export function getCurrentPrice(
  ticker: string,
  currency?: string,
): { price: number; currency: string } | null {
  return getPrice(ticker, new Date().toISOString().slice(0, 10));
}
