import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Spot price fetcher — Yahoo Finance only (the v8 chart endpoint, auth-free).
 *
 * Quotes are cached to `<dataDir>/price-cache.json` keyed by the bare
 * uppercase Yahoo symbol, with a per-symbol timestamp. Stale entries are
 * refreshed; fetch failures fall back to the last cached value so a flaky
 * network never blanks out the portfolio.
 */

export interface Quote {
  price: number;
  currency: string;
  asOf: string;
}

interface PriceCacheFile {
  entries: Record<string, Quote>;
}

const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export class PriceService {
  private readonly cachePath: string;
  private cache: PriceCacheFile;
  private readonly maxAgeMs: number;

  constructor(dataDir: string, maxAgeMs = DEFAULT_MAX_AGE_MS) {
    this.cachePath = join(dataDir, 'price-cache.json');
    this.maxAgeMs = maxAgeMs;
    this.cache = existsSync(this.cachePath)
      ? safeParse(readFileSync(this.cachePath, 'utf-8'))
      : { entries: {} };
  }

  private save(): void {
    try {
      writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch {
      /* non-fatal */
    }
  }

  private isFresh(quote: Quote): boolean {
    const age = Date.now() - new Date(quote.asOf).getTime();
    return age >= 0 && age < this.maxAgeMs;
  }

  async get(symbol: string): Promise<Quote | null> {
    const key = symbol.trim().toUpperCase();
    if (!key) return null;
    const cached = this.cache.entries[key];
    if (cached && this.isFresh(cached)) return cached;

    let verified: YahooVerifyData | null = null;
    try {
      verified = await verifyYahooSymbol(symbol);
    } catch {
      verified = null;
    }

    if (verified) {
      const quote: Quote = {
        price: verified.price,
        currency: verified.currency,
        asOf: new Date().toISOString(),
      };
      this.cache.entries[key] = quote;
      this.save();
      return quote;
    }

    return cached ?? null;
  }

  async getMany(symbols: string[]): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>();
    await Promise.all(
      symbols.map(async symbol => {
        const quote = await this.get(symbol);
        if (quote) out.set(symbol.trim().toUpperCase(), quote);
      }),
    );
    return out;
  }
}

export interface YahooVerifyData {
  price: number;
  currency: string;
  symbol: string;
  exchangeName: string | null;
  shortName: string | null;
  longName: string | null;
}

/**
 * Probe a Yahoo Finance symbol via the public v8 chart endpoint. Used both
 * for price fetching and by the Instruments tab's Verify button. Throws a
 * descriptive error on HTTP failure so the UI can surface a message.
 */
export async function verifyYahooSymbol(symbol: string): Promise<YahooVerifyData | null> {
  const trimmed = symbol.trim();
  if (!trimmed) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(trimmed)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (ha-investments)' },
  });
  if (!res.ok) {
    throw new Error(`Yahoo HTTP ${res.status}`);
  }
  const json = (await res.json()) as any;
  const errMsg = json?.chart?.error?.description;
  if (errMsg) throw new Error(errMsg);
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    currency: String(meta.currency ?? 'USD').toUpperCase(),
    symbol: String(meta.symbol ?? trimmed),
    exchangeName: meta.exchangeName ? String(meta.exchangeName) : null,
    shortName: meta.shortName ? String(meta.shortName) : null,
    longName: meta.longName ? String(meta.longName) : null,
  };
}

function safeParse(text: string): PriceCacheFile {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
      // Keep only entries in the new shape (bare-symbol key, {price, currency,
      // asOf}); pre-2.0 `provider:symbol` entries are simply dropped and
      // refetched.
      const entries: Record<string, Quote> = {};
      for (const [key, value] of Object.entries(parsed.entries as Record<string, any>)) {
        if (key.includes(':')) continue;
        if (typeof value?.price === 'number' && typeof value?.currency === 'string' && typeof value?.asOf === 'string') {
          entries[key] = { price: value.price, currency: value.currency, asOf: value.asOf };
        }
      }
      return { entries };
    }
  } catch {
    /* fall through */
  }
  return { entries: {} };
}
