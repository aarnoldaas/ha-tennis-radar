import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Finnhub fundamentals service. Wraps a small set of free-tier endpoints
 * needed by the Watchlist tab:
 *   - `/quote` — last price + day change
 *   - `/stock/metric` — P/E (TTM / Fwd), EPS, 52-week range, growth %
 *   - `/stock/profile2` — name, sector, country, weburl
 *   - `/calendar/earnings` — next earnings date(s)
 *   - `/stock/dividend` — recent + upcoming ex-div rows
 *   - `/search` — typeahead for the "Add ticker" modal
 *
 * Everything is cached to `<dataDir>/fundamentals-cache.json` with a per-
 * endpoint TTL. Failures are absorbed (the UI degrades to "—" cells); a
 * short negative-cache TTL keeps us from hammering symbols that 403 on the
 * free tier (most non-US tickers).
 *
 * If `FINNHUB_API_KEY` is unset the service is in disabled mode — every
 * call resolves to `null` so callers can render the empty state without
 * special-casing.
 */

const TTL = {
  quote: 15 * 60 * 1000,
  metric: 24 * 60 * 60 * 1000,
  profile: 7 * 24 * 60 * 60 * 1000,
  earnings: 6 * 60 * 60 * 1000,
  dividend: 24 * 60 * 60 * 1000,
  search: 24 * 60 * 60 * 1000,
  negative: 60 * 60 * 1000,
} as const;

type Endpoint = keyof typeof TTL;

interface CacheEntry<T> {
  value: T | null;
  asOf: string;
  /** Marks a 4xx / "no data" outcome so we don't churn the free-tier budget. */
  negative?: boolean;
}

interface CacheFile {
  entries: Record<string, CacheEntry<unknown>>;
}

export interface FinnhubQuote {
  price: number;
  dayChange: number;
  dayChangePct: number;
  prevClose: number;
  asOf: number;
}

export interface FinnhubMetric {
  peTTM: number | null;
  peForward: number | null;
  epsTTM: number | null;
  beta: number | null;
  marketCap: number | null;
  week52High: number | null;
  week52Low: number | null;
  dividendYieldAnnual: number | null;
  payoutRatio: number | null;
  revenueGrowthTTMYoy: number | null;
  revenueGrowth5Y: number | null;
  revenueGrowthQuarterlyYoy: number | null;
  epsGrowthTTMYoy: number | null;
  epsGrowthQuarterlyYoy: number | null;
}

export interface FinnhubProfile {
  name: string | null;
  ticker: string | null;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  industry: string | null;
  ipo: string | null;
  logo: string | null;
  weburl: string | null;
  marketCap: number | null;
  shareOutstanding: number | null;
}

export interface FinnhubEarningsEvent {
  symbol: string;
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  hour: string | null;
  quarter: number | null;
  year: number | null;
}

export interface FinnhubDividend {
  symbol: string;
  date: string;
  amount: number;
  currency: string | null;
  payDate: string | null;
  recordDate: string | null;
  declarationDate: string | null;
}

export interface FinnhubSearchHit {
  symbol: string;
  description: string;
  type: string | null;
  displaySymbol: string | null;
}

export class FinnhubService {
  private readonly cachePath: string;
  private cache: CacheFile;
  private readonly apiKey: string | null;

  constructor(dataDir: string) {
    this.cachePath = join(dataDir, 'fundamentals-cache.json');
    this.cache = existsSync(this.cachePath)
      ? safeParse(readFileSync(this.cachePath, 'utf-8'))
      : { entries: {} };
    const key = (process.env.FINNHUB_API_KEY || '').trim();
    this.apiKey = key || null;
  }

  isEnabled(): boolean {
    return this.apiKey !== null;
  }

  private save(): void {
    try {
      writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch {
      // non-fatal — cache is purely an optimisation
    }
  }

  private readCache<T>(endpoint: Endpoint, key: string): CacheEntry<T> | null {
    const raw = this.cache.entries[`${endpoint}:${key}`] as CacheEntry<T> | undefined;
    if (!raw) return null;
    const age = Date.now() - new Date(raw.asOf).getTime();
    const ttl = raw.negative ? TTL.negative : TTL[endpoint];
    if (age < 0 || age > ttl) return null;
    return raw;
  }

  private writeCache<T>(endpoint: Endpoint, key: string, value: T | null, negative = false): void {
    this.cache.entries[`${endpoint}:${key}`] = {
      value,
      asOf: new Date().toISOString(),
      ...(negative ? { negative: true } : {}),
    };
    this.save();
  }

  private async call<T>(path: string, params: Record<string, string | number>): Promise<T | null> {
    if (!this.apiKey) return null;
    const url = new URL(`https://finnhub.io/api/v1${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set('token', this.apiKey);
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'ha-investments' },
    });
    if (res.status === 429) {
      // Rate-limit hits return after a short retry-after; for the addon's
      // single-user use-case it's cleaner to bail and let the cache hold.
      return null;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Finnhub HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async getQuote(symbol: string): Promise<FinnhubQuote | null> {
    const key = symbol.toUpperCase();
    const cached = this.readCache<FinnhubQuote>('quote', key);
    if (cached) return cached.value;
    if (!this.apiKey) return null;
    try {
      const json = await this.call<any>('/quote', { symbol });
      if (!json || typeof json.c !== 'number' || json.c <= 0) {
        this.writeCache('quote', key, null, true);
        return null;
      }
      const quote: FinnhubQuote = {
        price: Number(json.c),
        prevClose: Number(json.pc),
        dayChange: Number(json.d ?? json.c - json.pc),
        dayChangePct: Number(json.dp ?? 0) / 100,
        asOf: Number(json.t ?? 0) * 1000,
      };
      this.writeCache('quote', key, quote);
      return quote;
    } catch {
      this.writeCache('quote', key, null, true);
      return null;
    }
  }

  async getMetrics(symbol: string): Promise<FinnhubMetric | null> {
    const key = symbol.toUpperCase();
    const cached = this.readCache<FinnhubMetric>('metric', key);
    if (cached) return cached.value;
    if (!this.apiKey) return null;
    try {
      const json = await this.call<any>('/stock/metric', { symbol, metric: 'all' });
      const m = json?.metric;
      if (!m) {
        this.writeCache('metric', key, null, true);
        return null;
      }
      const metric: FinnhubMetric = {
        peTTM: numOrNull(m.peTTM ?? m.peNormalizedAnnual ?? m.peExclExtraTTM),
        peForward: numOrNull(m.peFwd ?? m.forwardPE ?? null),
        epsTTM: numOrNull(m.epsTTM ?? m.epsBasicExclExtraItemsTTM),
        beta: numOrNull(m.beta),
        marketCap: numOrNull(m.marketCapitalization) != null
          ? (numOrNull(m.marketCapitalization) as number) * 1_000_000
          : null,
        week52High: numOrNull(m['52WeekHigh']),
        week52Low: numOrNull(m['52WeekLow']),
        dividendYieldAnnual: numOrNull(m.dividendYieldIndicatedAnnual) != null
          ? (numOrNull(m.dividendYieldIndicatedAnnual) as number) / 100
          : null,
        payoutRatio: numOrNull(m.payoutRatioTTM) != null
          ? (numOrNull(m.payoutRatioTTM) as number) / 100
          : null,
        revenueGrowthTTMYoy: pctOrNull(m.revenueGrowthTTMYoy),
        revenueGrowth5Y: pctOrNull(m.revenueGrowth5Y),
        revenueGrowthQuarterlyYoy: pctOrNull(m.revenueGrowthQuarterlyYoy),
        epsGrowthTTMYoy: pctOrNull(m.epsGrowthTTMYoy),
        epsGrowthQuarterlyYoy: pctOrNull(m.epsGrowthQuarterlyYoy),
      };
      this.writeCache('metric', key, metric);
      return metric;
    } catch {
      this.writeCache('metric', key, null, true);
      return null;
    }
  }

  async getProfile(symbol: string): Promise<FinnhubProfile | null> {
    const key = symbol.toUpperCase();
    const cached = this.readCache<FinnhubProfile>('profile', key);
    if (cached) return cached.value;
    if (!this.apiKey) return null;
    try {
      const json = await this.call<any>('/stock/profile2', { symbol });
      if (!json || !json.name) {
        this.writeCache('profile', key, null, true);
        return null;
      }
      const profile: FinnhubProfile = {
        name: json.name ?? null,
        ticker: json.ticker ?? null,
        exchange: json.exchange ?? null,
        country: json.country ?? null,
        currency: json.currency ?? null,
        industry: json.finnhubIndustry ?? null,
        ipo: json.ipo ?? null,
        logo: json.logo ?? null,
        weburl: json.weburl ?? null,
        marketCap: numOrNull(json.marketCapitalization) != null
          ? (numOrNull(json.marketCapitalization) as number) * 1_000_000
          : null,
        shareOutstanding: numOrNull(json.shareOutstanding) != null
          ? (numOrNull(json.shareOutstanding) as number) * 1_000_000
          : null,
      };
      this.writeCache('profile', key, profile);
      return profile;
    } catch {
      this.writeCache('profile', key, null, true);
      return null;
    }
  }

  async getEarningsCalendar(
    symbol: string,
    opts: { fromDays?: number; toDays?: number } = {},
  ): Promise<FinnhubEarningsEvent[]> {
    const from = isoDate(new Date(Date.now() + (opts.fromDays ?? -7) * 24 * 60 * 60 * 1000));
    const to = isoDate(new Date(Date.now() + (opts.toDays ?? 120) * 24 * 60 * 60 * 1000));
    const key = `${symbol.toUpperCase()}|${from}|${to}`;
    const cached = this.readCache<FinnhubEarningsEvent[]>('earnings', key);
    if (cached) return cached.value ?? [];
    if (!this.apiKey) return [];
    try {
      const json = await this.call<any>('/calendar/earnings', { symbol, from, to });
      const events: FinnhubEarningsEvent[] = (json?.earningsCalendar ?? []).map((row: any) => ({
        symbol: String(row.symbol ?? symbol),
        date: String(row.date ?? ''),
        epsEstimate: numOrNull(row.epsEstimate),
        epsActual: numOrNull(row.epsActual),
        revenueEstimate: numOrNull(row.revenueEstimate),
        revenueActual: numOrNull(row.revenueActual),
        hour: row.hour ?? null,
        quarter: numOrNull(row.quarter),
        year: numOrNull(row.year),
      }));
      this.writeCache('earnings', key, events, events.length === 0);
      return events;
    } catch {
      this.writeCache('earnings', key, null, true);
      return [];
    }
  }

  async getDividends(
    symbol: string,
    opts: { fromDays?: number; toDays?: number } = {},
  ): Promise<FinnhubDividend[]> {
    const from = isoDate(new Date(Date.now() + (opts.fromDays ?? -365) * 24 * 60 * 60 * 1000));
    const to = isoDate(new Date(Date.now() + (opts.toDays ?? 120) * 24 * 60 * 60 * 1000));
    const key = `${symbol.toUpperCase()}|${from}|${to}`;
    const cached = this.readCache<FinnhubDividend[]>('dividend', key);
    if (cached) return cached.value ?? [];
    if (!this.apiKey) return [];
    try {
      const json = await this.call<any>('/stock/dividend', { symbol, from, to });
      const rows: FinnhubDividend[] = (Array.isArray(json) ? json : []).map((row: any) => ({
        symbol: String(row.symbol ?? symbol),
        date: String(row.date ?? ''),
        amount: numOrNull(row.amount) ?? 0,
        currency: row.currency ?? null,
        payDate: row.payDate ?? null,
        recordDate: row.recordDate ?? null,
        declarationDate: row.declarationDate ?? null,
      }));
      this.writeCache('dividend', key, rows, rows.length === 0);
      return rows;
    } catch {
      this.writeCache('dividend', key, null, true);
      return [];
    }
  }

  async search(query: string): Promise<FinnhubSearchHit[]> {
    const trimmed = query.trim();
    if (trimmed.length < 1) return [];
    const key = trimmed.toLowerCase();
    const cached = this.readCache<FinnhubSearchHit[]>('search', key);
    if (cached) return cached.value ?? [];
    if (!this.apiKey) return [];
    try {
      const json = await this.call<any>('/search', { q: trimmed });
      const hits: FinnhubSearchHit[] = (json?.result ?? [])
        .filter((row: any) => row?.symbol)
        .slice(0, 20)
        .map((row: any) => ({
          symbol: String(row.symbol),
          description: String(row.description ?? ''),
          type: row.type ?? null,
          displaySymbol: row.displaySymbol ?? null,
        }));
      this.writeCache('search', key, hits);
      return hits;
    } catch {
      this.writeCache('search', key, null, true);
      return [];
    }
  }

  /**
   * Force-invalidate every quote entry. Used by the "Refresh fundamentals"
   * button to pull fresh prices without trashing the slow-moving metric /
   * profile caches that don't benefit from being repulled.
   */
  invalidateQuotes(): void {
    let changed = false;
    for (const key of Object.keys(this.cache.entries)) {
      if (key.startsWith('quote:')) {
        delete this.cache.entries[key];
        changed = true;
      }
    }
    if (changed) this.save();
  }
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Finnhub returns growth fields as plain numbers ("0.12" meaning 12%).
 * Normalise to a fraction so the UI's existing percent formatters work.
 */
function pctOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  if (n === null) return null;
  // Finnhub publishes growth metrics as fractions already (e.g. 0.18 = 18%),
  // but some endpoints occasionally return percent-scale values. We only
  // ever see fractions in practice; pass through unchanged.
  return n;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function safeParse(text: string): CacheFile {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'entries' in parsed) {
      return parsed as CacheFile;
    }
  } catch {
    // ignore — start with empty cache
  }
  return { entries: {} };
}
