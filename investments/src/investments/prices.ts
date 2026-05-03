// ============================================================================
// Market Prices — Stooq (CSV) + Hardcoded Fallback + File Persistence
// ============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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

// Slim StockInfo — Stooq provides price only, not fundamentals.
export interface StockInfo {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number;
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

function savePriceHistory(): void {
  if (!priceHistoryDir) return;
  mkdirSync(priceHistoryDir, { recursive: true });
  const filePath = join(priceHistoryDir, 'price-history.json');
  writeFileSync(filePath, JSON.stringify(fileBasedHistory, null, 2), 'utf-8');
}

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

export function getPriceHistory(ticker: string): PriceEntry[] {
  const hardcoded = HARDCODED_PRICES[ticker] || [];
  const fileBased = fileBasedHistory[ticker] || [];

  const map = new Map<string, PriceEntry>();
  for (const entry of hardcoded) {
    map.set(entry.date, entry);
  }
  for (const entry of fileBased) {
    map.set(entry.date, entry);
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function updatePriceEntry(ticker: string, date: string, price: number): void {
  appendPriceEntry(ticker, { date, price, currency: (fileBasedHistory[ticker]?.[0]?.currency ?? HARDCODED_PRICES[ticker]?.[0]?.currency ?? 'USD') });
  savePriceHistory();
}

export function deletePriceEntry(ticker: string, date: string): void {
  if (!fileBasedHistory[ticker]) return;
  fileBasedHistory[ticker] = fileBasedHistory[ticker].filter(e => e.date !== date);
  if (fileBasedHistory[ticker].length === 0) delete fileBasedHistory[ticker];
  savePriceHistory();
}

export function getFileBasedPriceHistory(): PriceHistoryFile {
  return fileBasedHistory;
}

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

export function getAllStockInfo(): StockInfo[] {
  return [...stockInfoCache.values()];
}

// ----------------------------------------------------------------------------
// Ticker mapping: internal symbol → Stooq symbol
// Tickers not in this map are skipped during refresh (manual entry only).
// ----------------------------------------------------------------------------

const STOOQ_TICKER_MAP: Record<string, string> = {
  ASML: 'asml.nl',
  BABA: 'baba.us',
  WIX: 'wix.us',
  GOOG: 'goog.us',
  PBR: 'pbr.us',
  NOVA: 'nvo.us',
};

/**
 * Override map for tickers where the price source does not return a currency.
 */
const TICKER_CURRENCY_OVERRIDE: Record<string, string> = {
  '002594': 'CNY',
};

// ----------------------------------------------------------------------------
// Stooq fetchers
// ----------------------------------------------------------------------------

function resolveCurrency(ticker: string): string {
  return TICKER_CURRENCY_OVERRIDE[ticker]
    || HARDCODED_PRICES[ticker]?.[0]?.currency
    || 'USD';
}

/**
 * Parse a Stooq CSV response. The first line is the header (e.g.
 * `Symbol,Date,Time,Open,High,Low,Close,Volume`). Returns rows as objects
 * keyed by lowercased header name. Values that equal "N/D" are treated as null.
 */
function parseStooqCsv(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length !== headers.length) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j].trim();
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Fetch a live quote from Stooq for the given internal ticker.
 * Returns { price, currency, name } or null on failure / no data.
 */
async function fetchStooqQuote(ticker: string): Promise<{ price: number; currency: string; name: string } | null> {
  const stooqSymbol = STOOQ_TICKER_MAP[ticker];
  if (!stooqSymbol) return null;

  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcnv&h&e=csv`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Stooq] HTTP ${res.status} for ${stooqSymbol}`);
      return null;
    }
    const csv = await res.text();
    const rows = parseStooqCsv(csv);
    if (rows.length === 0) {
      console.warn(`[Stooq] Empty CSV for ${stooqSymbol}`);
      return null;
    }
    const row = rows[0];
    const closeRaw = row['close'];
    if (!closeRaw || closeRaw === 'N/D') {
      console.warn(`[Stooq] No data for ${stooqSymbol}`);
      return null;
    }
    const price = parseFloat(closeRaw);
    if (!Number.isFinite(price)) return null;
    const name = row['name'] || ticker;
    const currency = resolveCurrency(ticker);
    console.log(`[Stooq] ${ticker} (${stooqSymbol}): ${price} ${currency}`);
    return { price, currency, name };
  } catch (e) {
    console.warn(`[Stooq] Failed for ${ticker}:`, e);
    return null;
  }
}

/**
 * Fetch daily history from Stooq for the given internal ticker.
 * Returns an array of PriceEntry sorted ascending by date, or [] on failure.
 */
async function fetchStooqHistory(ticker: string, from: string, to: string): Promise<PriceEntry[]> {
  const stooqSymbol = STOOQ_TICKER_MAP[ticker];
  if (!stooqSymbol) return [];

  const d1 = from.replace(/-/g, '');
  const d2 = to.replace(/-/g, '');
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d&d1=${d1}&d2=${d2}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Stooq] History HTTP ${res.status} for ${stooqSymbol}`);
      return [];
    }
    const csv = await res.text();
    const rows = parseStooqCsv(csv);
    const currency = resolveCurrency(ticker);
    const entries: PriceEntry[] = [];
    for (const row of rows) {
      const date = row['date'];
      const closeRaw = row['close'];
      if (!date || !closeRaw || closeRaw === 'N/D') continue;
      const price = parseFloat(closeRaw);
      if (!Number.isFinite(price)) continue;
      entries.push({ date, price, currency });
    }
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.warn(`[Stooq] History failed for ${ticker}:`, e);
    return [];
  }
}

// ----------------------------------------------------------------------------
// One-time history backfill
// ----------------------------------------------------------------------------

const BACKFILL_FLAG = 'stooq-backfilled.json';
const BACKFILL_YEARS = 5;

async function backfillHistoryIfNeeded(): Promise<void> {
  if (!priceHistoryDir) return;
  const flagPath = join(priceHistoryDir, BACKFILL_FLAG);
  if (existsSync(flagPath)) return;

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - BACKFILL_YEARS);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  const results: Record<string, number> = {};
  for (const ticker of Object.keys(STOOQ_TICKER_MAP)) {
    const entries = await fetchStooqHistory(ticker, from, to);
    for (const entry of entries) {
      appendPriceEntry(ticker, entry);
    }
    results[ticker] = entries.length;
  }
  savePriceHistory();

  mkdirSync(priceHistoryDir, { recursive: true });
  writeFileSync(flagPath, JSON.stringify({ backfilledAt: new Date().toISOString(), results }, null, 2), 'utf-8');
  console.log(`[Stooq] Backfilled ${BACKFILL_YEARS}y history:`, results);
}

// ----------------------------------------------------------------------------
// In-memory price cache (populated by manual refresh)
// ----------------------------------------------------------------------------

const priceCache = new Map<string, CachedPrice>();

/**
 * Fetch live prices for a list of tickers from Stooq.
 * Tickers not mapped in STOOQ_TICKER_MAP are skipped (manual-entry only).
 * Also performs a one-time ~5y history backfill on the first run.
 */
export async function refreshPrices(tickers: string[]): Promise<{ fetched: number; failed: string[]; skipped: string[] }> {
  await backfillHistoryIfNeeded();

  const failed: string[] = [];
  const skipped: string[] = [];
  let fetched = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const ticker of tickers) {
    if (!STOOQ_TICKER_MAP[ticker]) {
      skipped.push(ticker);
      continue;
    }
    const quote = await fetchStooqQuote(ticker);
    if (!quote) {
      failed.push(ticker);
      continue;
    }
    const now = new Date().toISOString();
    priceCache.set(ticker, {
      price: quote.price,
      currency: quote.currency,
      lastUpdated: now,
    });
    appendPriceEntry(ticker, {
      date: today,
      price: quote.price,
      currency: quote.currency,
    });
    stockInfoCache.set(ticker, {
      ticker,
      name: quote.name || stockInfoCache.get(ticker)?.name || ticker,
      currency: quote.currency,
      currentPrice: quote.price,
      lastUpdated: now,
    });
    fetched++;
  }

  savePriceHistory();
  return { fetched, failed, skipped };
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

export function getCurrentPrice(
  ticker: string,
): { price: number; currency: string; lastUpdated: string | null } | null {
  const cached = priceCache.get(ticker);
  if (cached) {
    return { price: cached.price, currency: cached.currency, lastUpdated: cached.lastUpdated };
  }

  const today = new Date().toISOString().slice(0, 10);
  const allEntries = getPriceHistory(ticker);
  if (allEntries.length > 0) {
    const entry = findClosestEntry(allEntries, today);
    if (entry) {
      const isFromFile = fileBasedHistory[ticker]?.some(e => e.date === entry.date);
      return { price: entry.price, currency: entry.currency, lastUpdated: isFromFile ? entry.date : null };
    }
  }

  return null;
}

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
