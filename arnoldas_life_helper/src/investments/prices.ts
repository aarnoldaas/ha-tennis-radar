// ============================================================================
// Market Prices — Yahoo Finance + Hardcoded Fallback + File Persistence
// ============================================================================

import YahooFinance from 'yahoo-finance2';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const yf = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] });

export interface PriceEntry {
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
// Stock fundamental info (P/E, dividends, etc.)
// ----------------------------------------------------------------------------

export interface StockInfo {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number;
  peRatio: number | null;
  forwardPeRatio: number | null;
  epsTrailingTwelveMonths: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  exDividendDate: string | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  beta: number | null;
  earningsDate: string | null;
  lastUpdated: string;
}

const stockInfoCache = new Map<string, StockInfo>();

// ----------------------------------------------------------------------------
// File-based price history
// ----------------------------------------------------------------------------

let priceHistoryDir = '';

export interface PriceHistoryFile {
  [ticker: string]: PriceEntry[];
}

let fileBasedHistory: PriceHistoryFile = {};

/**
 * Initialize price history from file. Call once at startup with the data directory.
 */
export function loadPriceHistory(dataDir: string): void {
  priceHistoryDir = join(dataDir, 'Investments');
  const filePath = join(priceHistoryDir, 'price-history.json');
  if (existsSync(filePath)) {
    try {
      fileBasedHistory = JSON.parse(readFileSync(filePath, 'utf-8'));
      console.log(`[Prices] Loaded price history from file (${Object.keys(fileBasedHistory).length} tickers)`);
    } catch (e) {
      console.warn(`[Prices] Failed to parse price-history.json:`, e);
      fileBasedHistory = {};
    }
  }
}

/**
 * Save current price history to file.
 */
function savePriceHistory(): void {
  if (!priceHistoryDir) return;
  mkdirSync(priceHistoryDir, { recursive: true });
  const filePath = join(priceHistoryDir, 'price-history.json');
  writeFileSync(filePath, JSON.stringify(fileBasedHistory, null, 2), 'utf-8');
}

/**
 * Append a price entry to the file-based history (avoids duplicates for the same date).
 */
function appendPriceEntry(ticker: string, entry: PriceEntry): void {
  if (!fileBasedHistory[ticker]) {
    fileBasedHistory[ticker] = [];
  }
  const existing = fileBasedHistory[ticker].find(e => e.date === entry.date);
  if (existing) {
    existing.price = entry.price;
    existing.currency = entry.currency;
  } else {
    fileBasedHistory[ticker].push(entry);
    fileBasedHistory[ticker].sort((a, b) => a.date.localeCompare(b.date));
  }
}

/**
 * Get the full price history for a ticker (file-based + hardcoded merged).
 */
export function getPriceHistory(ticker: string): PriceEntry[] {
  const hardcoded = HARDCODED_PRICES[ticker] || [];
  const fileBased = fileBasedHistory[ticker] || [];

  // Merge: file-based takes priority for same dates
  const map = new Map<string, PriceEntry>();
  for (const entry of hardcoded) {
    map.set(entry.date, entry);
  }
  for (const entry of fileBased) {
    map.set(entry.date, entry);
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get all price history across all tickers.
 */
export function getAllPriceHistory(): PriceHistoryFile {
  const allTickers = new Set([
    ...Object.keys(HARDCODED_PRICES),
    ...Object.keys(fileBasedHistory),
  ]);
  const result: PriceHistoryFile = {};
  for (const ticker of allTickers) {
    result[ticker] = getPriceHistory(ticker);
  }
  return result;
}

/**
 * Get all cached stock info.
 */
export function getAllStockInfo(): StockInfo[] {
  return [...stockInfoCache.values()];
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
 * Updates the in-memory cache and appends to file-based price history.
 * Also fetches stock fundamental info (P/E, dividends, etc.).
 * Returns the number of successfully fetched tickers.
 */
export async function refreshPrices(tickers: string[]): Promise<{ fetched: number; failed: string[] }> {
  const failed: string[] = [];
  let fetched = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const ticker of tickers) {
    const yahooTicker = YAHOO_TICKER_MAP[ticker] || ticker;
    try {
      const quote = await yf.quote(yahooTicker) as any;
      if (quote && quote.regularMarketPrice) {
        const overrideCurrency = TICKER_CURRENCY_OVERRIDE[ticker];
        const knownCurrency = HARDCODED_PRICES[ticker]?.[0]?.currency;
        const currency = overrideCurrency || quote.currency || knownCurrency || 'USD';
        const now = new Date().toISOString();

        priceCache.set(ticker, {
          price: quote.regularMarketPrice,
          currency,
          lastUpdated: now,
        });

        // Append to file-based price history
        appendPriceEntry(ticker, {
          date: today,
          price: quote.regularMarketPrice,
          currency,
        });

        // Build stock info from quote data
        stockInfoCache.set(ticker, {
          ticker,
          name: quote.shortName || quote.longName || ticker,
          currency,
          currentPrice: quote.regularMarketPrice,
          peRatio: quote.trailingPE ?? null,
          forwardPeRatio: quote.forwardPE ?? null,
          epsTrailingTwelveMonths: quote.epsTrailingTwelveMonths ?? null,
          dividendYield: quote.dividendYield != null ? quote.dividendYield * 100 : null,
          dividendRate: quote.dividendRate ?? quote.trailingAnnualDividendRate ?? null,
          exDividendDate: quote.exDividendDate ? new Date(quote.exDividendDate).toISOString().slice(0, 10) : null,
          marketCap: quote.marketCap ?? null,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
          fiftyDayAverage: quote.fiftyDayAverage ?? null,
          twoHundredDayAverage: quote.twoHundredDayAverage ?? null,
          beta: quote.beta ?? null,
          earningsDate: quote.earningsTimestamp ? new Date(quote.earningsTimestamp * 1000).toISOString().slice(0, 10) : null,
          lastUpdated: now,
        });

        fetched++;
      } else {
        failed.push(ticker);
      }
    } catch {
      failed.push(ticker);
    }
  }

  // Persist price history to file
  savePriceHistory();

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
 * Uses file-based history + hardcoded historical data (merged).
 */
export function getPrice(
  ticker: string,
  date: string,
): { price: number; currency: string } | null {
  const allEntries = getPriceHistory(ticker);
  if (allEntries.length === 0) {
    console.warn(`No price data for ticker "${ticker}"`);
    return null;
  }
  const entry = findClosestEntry(allEntries, date);
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

  // Fall back to file-based + hardcoded history
  const today = new Date().toISOString().slice(0, 10);
  const allEntries = getPriceHistory(ticker);
  if (allEntries.length > 0) {
    const entry = findClosestEntry(allEntries, today);
    if (entry) {
      // If the entry is from file-based history (recent), mark it as such
      const isFromFile = fileBasedHistory[ticker]?.some(e => e.date === entry.date);
      return { price: entry.price, currency: entry.currency, lastUpdated: isFromFile ? entry.date : null };
    }
  }

  return null;
}

/**
 * Get all known ticker symbols (from hardcoded data + file history + cache).
 */
export function getKnownTickers(): string[] {
  const tickers = new Set<string>(Object.keys(HARDCODED_PRICES));
  for (const ticker of Object.keys(fileBasedHistory)) {
    tickers.add(ticker);
  }
  for (const ticker of priceCache.keys()) {
    tickers.add(ticker);
  }
  return [...tickers];
}
