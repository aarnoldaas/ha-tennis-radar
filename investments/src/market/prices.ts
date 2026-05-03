import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PriceSource } from '../parsers/types.js';

/**
 * Spot market price fetcher. Supports two providers:
 *   - `stooq` — Stooq free daily-close endpoint, mostly for Baltic tickers
 *     (e.g. `ign1l.lt`). Returns the previous close.
 *   - `yahoo` — Yahoo Finance quote endpoint, for US / ADR / European names.
 *
 * Values are cached to `<dataDir>/price-cache.json` with a per-symbol timestamp
 * so a reprice doesn't hammer external services. Callers pass a `maxAgeMs`;
 * stale entries are refreshed. Failures fall back to the last cached value.
 */

interface PriceCacheEntry {
  price: number;
  currency: string;
  asOf: string;
  provider: string;
  symbol: string;
}

interface PriceCacheFile {
  entries: Record<string, PriceCacheEntry>;
}

export interface PriceQuote {
  price: number | null;
  currency: string | null;
  asOf: string | null;
  provider: string | null;
}

export class PriceService {
  private readonly cachePath: string;
  private cache: PriceCacheFile;
  private readonly maxAgeMs: number;

  constructor(dataDir: string, maxAgeMs = 6 * 60 * 60 * 1000) {
    this.cachePath = join(dataDir, 'price-cache.json');
    this.maxAgeMs = maxAgeMs;
    this.cache = existsSync(this.cachePath)
      ? JSON.parse(readFileSync(this.cachePath, 'utf-8'))
      : { entries: {} };
  }

  private save(): void {
    try {
      writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch {
      /* ignore — non-fatal for portfolio service */
    }
  }

  private key(src: PriceSource): string {
    return `${src.provider}:${src.symbol}`;
  }

  private isFresh(entry: PriceCacheEntry): boolean {
    const age = Date.now() - new Date(entry.asOf).getTime();
    return age >= 0 && age < this.maxAgeMs;
  }

  async get(source: PriceSource): Promise<PriceQuote> {
    const key = this.key(source);
    const cached = this.cache.entries[key];
    if (cached && this.isFresh(cached)) {
      return { price: cached.price, currency: cached.currency, asOf: cached.asOf, provider: source.provider };
    }

    let fresh: Omit<PriceCacheEntry, 'asOf' | 'provider' | 'symbol'> | null = null;
    try {
      if (source.provider === 'stooq') fresh = await fetchStooq(source.symbol);
      else if (source.provider === 'yahoo') fresh = await fetchYahoo(source.symbol);
    } catch {
      fresh = null;
    }

    if (fresh) {
      const entry: PriceCacheEntry = {
        ...fresh,
        asOf: new Date().toISOString(),
        provider: source.provider,
        symbol: source.symbol,
      };
      this.cache.entries[key] = entry;
      this.save();
      return { price: entry.price, currency: entry.currency, asOf: entry.asOf, provider: source.provider };
    }

    if (cached) {
      return { price: cached.price, currency: cached.currency, asOf: cached.asOf, provider: source.provider };
    }
    return { price: null, currency: null, asOf: null, provider: source.provider };
  }

  async getMany(sources: PriceSource[]): Promise<Map<string, PriceQuote>> {
    const out = new Map<string, PriceQuote>();
    await Promise.all(
      sources.map(async src => {
        out.set(this.key(src), await this.get(src));
      }),
    );
    return out;
  }
}

/**
 * Yahoo Finance chart API returns up-to-date quotes for stocks, ETFs, and
 * FX pairs without auth. We prefer it over Stooq because it also reports
 * the native currency on the quote meta.
 */
async function fetchYahoo(symbol: string): Promise<{ price: number; currency: string } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (ha-investments)' },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, currency: String(meta.currency ?? 'USD').toUpperCase() };
}

/**
 * Stooq end-of-day close fallback. Intentionally light — some Baltic symbols
 * are flaky on Yahoo around market open.
 */
async function fetchStooq(symbol: string): Promise<{ price: number; currency: string } | null> {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}&i=d&f=sd2t2ohlcvn&h&e=csv`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const cells = lines[1].split(',');
  const close = Number(cells[6]);
  if (!Number.isFinite(close) || close <= 0) return null;
  const suffix = symbol.toLowerCase().split('.').pop() ?? '';
  const currency =
    suffix === 'uk' ? 'GBP' : ['lt', 'de', 'fr', 'it', 'es', 'nl'].includes(suffix) ? 'EUR' : 'USD';
  return { price: close, currency };
}
