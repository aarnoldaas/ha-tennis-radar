// ============================================================================
// Market Prices — Yahoo Finance + Hardcoded Fallback
// ============================================================================

import YahooFinance from 'yahoo-finance2';

const yf = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] });

interface PriceEntry {
  date: string;
  price: number;
  currency: string;
}

interface CachedPrice {
  price: number;
  currency: string;
  lastUpdated: string; // ISO 8601 timestamp
}

// ----------------------------------------------------------------------------
// Ticker mapping: internal symbol → Yahoo Finance symbol
// ----------------------------------------------------------------------------

const YAHOO_TICKER_MAP: Record<string, string> = {
  // Baltic stocks (Vilnius Stock Exchange)
  APG1L: 'APG1L.VS',
  IGN1L: 'IGN1L.VS',
  TEL1L: 'TEL1L.VS',
  KNF1L: 'KNF1L.VS',
  SAB1L: 'SAB1L.VS',
  LNA1L: 'LNA1L.VS',
  ROE1L: 'ROE1L.VS',
  // EU stocks
  ASML: 'ASML.AS',
  // China
  '002594': '002594.SZ',
  // Revolut brokerage
  E3G1: 'E3G1.F',   // Evolution AB on Frankfurt/GETTEX (EUR) — matches IB trading venue
  // US stocks — same ticker on Yahoo
  BABA: 'BABA',
  WIX: 'WIX',
  GOOG: 'GOOG',
  PBR: 'PBR',
  NOVA: 'NVO', // Novo Nordisk ADR
};

/**
 * Override map for tickers where Yahoo Finance returns a missing or incorrect currency.
 * The value is the correct trading currency for the ticker.
 */
const TICKER_CURRENCY_OVERRIDE: Record<string, string> = {
  '002594': 'CNY',  // BYD on Shenzhen — Yahoo may omit currency, price is in CNY
};

// ----------------------------------------------------------------------------
// In-memory price cache (populated by manual refresh)
// ----------------------------------------------------------------------------

const priceCache = new Map<string, CachedPrice>();

/**
 * Fetch live prices for a list of tickers from Yahoo Finance.
 * Updates the in-memory cache. Returns the number of successfully fetched tickers.
 */
export async function refreshPrices(tickers: string[]): Promise<{ fetched: number; failed: string[] }> {
  const failed: string[] = [];
  let fetched = 0;

  for (const ticker of tickers) {
    const yahooTicker = YAHOO_TICKER_MAP[ticker] || ticker;
    try {
      const quote = await yf.quote(yahooTicker) as { regularMarketPrice?: number; currency?: string };
      if (quote && quote.regularMarketPrice) {
        // Use explicit override first (for tickers where Yahoo returns wrong/missing currency),
        // then Yahoo's currency, then hardcoded fallback, then USD.
        const overrideCurrency = TICKER_CURRENCY_OVERRIDE[ticker];
        const knownCurrency = HARDCODED_PRICES[ticker]?.[0]?.currency;
        priceCache.set(ticker, {
          price: quote.regularMarketPrice,
          currency: overrideCurrency || quote.currency || knownCurrency || 'USD',
          lastUpdated: new Date().toISOString(),
        });
        fetched++;
      } else {
        failed.push(ticker);
      }
    } catch {
      failed.push(ticker);
    }
  }

  return { fetched, failed };
}

/**
 * Get the last refresh timestamp (oldest across all cached tickers), or null if nothing cached.
 */
export function getPriceRefreshTime(): string | null {
  if (priceCache.size === 0) return null;
  let oldest: string | null = null;
  for (const entry of priceCache.values()) {
    if (!oldest || entry.lastUpdated < oldest) oldest = entry.lastUpdated;
  }
  return oldest;
}

// ----------------------------------------------------------------------------
// Hardcoded historical prices (fallback for historical lookups and when fetch fails)
// ----------------------------------------------------------------------------

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
  "002594": [ // BYD (3:1 split June 2025; pre-split prices before that)
    { date: "2020-01-01", price: 50.00, currency: "CNY" },
    { date: "2021-01-01", price: 195.00, currency: "CNY" },
    { date: "2022-01-01", price: 270.00, currency: "CNY" },
    { date: "2023-01-01", price: 260.00, currency: "CNY" },
    { date: "2024-01-01", price: 220.00, currency: "CNY" },
    { date: "2025-01-01", price: 290.00, currency: "CNY" },
    { date: "2026-03-01", price: 105.00, currency: "CNY" },
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
  PBR: [ // Petrobras (Brazilian oil company, ADR)
    { date: "2020-01-01", price: 15.50, currency: "USD" },
    { date: "2021-01-01", price: 10.80, currency: "USD" },
    { date: "2022-01-01", price: 11.20, currency: "USD" },
    { date: "2023-01-01", price: 11.90, currency: "USD" },
    { date: "2024-01-01", price: 17.30, currency: "USD" },
    { date: "2025-01-01", price: 14.25, currency: "USD" },
    { date: "2026-03-01", price: 19.75, currency: "USD" },
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
  E3G1: [ // Evolution AB (Frankfurt/GETTEX, EUR)
    { date: "2020-01-01", price: 21.00, currency: "EUR" },
    { date: "2021-01-01", price: 76.00, currency: "EUR" },
    { date: "2022-01-01", price: 120.00, currency: "EUR" },
    { date: "2023-01-01", price: 95.00, currency: "EUR" },
    { date: "2024-01-01", price: 103.00, currency: "EUR" },
    { date: "2025-01-01", price: 95.00, currency: "EUR" },
    { date: "2026-03-01", price: 50.70, currency: "EUR" },
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
 * Uses hardcoded historical data only (for cost basis and historical lookups).
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
 * Get the current market price for a ticker.
 *
 * Priority:
 * 1. Live-fetched price from cache (populated by refreshPrices())
 * 2. Hardcoded fallback (closest to today)
 *
 * Returns price, currency, and lastUpdated timestamp (null if using hardcoded fallback).
 */
export function getCurrentPrice(
  ticker: string,
): { price: number; currency: string; lastUpdated: string | null } | null {
  // Check live cache first
  const cached = priceCache.get(ticker);
  if (cached) {
    return { price: cached.price, currency: cached.currency, lastUpdated: cached.lastUpdated };
  }

  // Fall back to hardcoded
  const today = new Date().toISOString().slice(0, 10);
  const fallback = getPrice(ticker, today);
  if (fallback) {
    return { price: fallback.price, currency: fallback.currency, lastUpdated: null };
  }

  return null;
}

/**
 * Get all known ticker symbols (from hardcoded data + cache).
 */
export function getKnownTickers(): string[] {
  const tickers = new Set<string>(Object.keys(HARDCODED_PRICES));
  for (const ticker of priceCache.keys()) {
    tickers.add(ticker);
  }
  return [...tickers];
}
