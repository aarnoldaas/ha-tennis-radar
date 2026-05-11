import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Yahoo Finance fundamentals service. Wraps the unofficial `quoteSummary`
 * endpoint to plug the gap left by Finnhub's free-tier US-only lock:
 *
 *   - Finnhub free returns 403 on every non-US symbol (Baltic, EU, HK, etc.)
 *   - Yahoo's `quoteSummary` covers virtually every Yahoo-listed symbol,
 *     auth-free, and returns trailing/forward P/E, EPS, growth, market cap,
 *     52-week range, next earnings date, ex-dividend date.
 *
 * Yahoo's v10 `quoteSummary` endpoint started requiring a `crumb` cookie
 * in 2023 to deter scraping. The handshake is:
 *   1. GET `fc.yahoo.com` → server sets `A1` (or `A3`) consent cookie
 *   2. GET `query1.finance.yahoo.com/v1/test/getcrumb` with the cookie →
 *      returns the crumb string
 *   3. include `?crumb=...` plus the cookie on every subsequent quoteSummary
 *      request
 *
 * We do the handshake lazily on the first call and keep the crumb in memory
 * for the lifetime of the process. On 401 we refresh it once and retry.
 *
 * Results are cached to `<dataDir>/yahoo-fundamentals-cache.json` per
 * (symbol, module-set) with a single TTL — Yahoo data updates slowly enough
 * that one TTL is sufficient, and we don't pay a free-tier quota so the
 * negative-cache tactic isn't needed (we still negative-cache transient
 * failures for an hour to avoid hammering on a flaky network).
 */

const QUOTE_SUMMARY_TTL = 12 * 60 * 60 * 1000;
const NEGATIVE_TTL = 60 * 60 * 1000;

const DEFAULT_MODULES = [
  'summaryDetail',
  'defaultKeyStatistics',
  'financialData',
  'calendarEvents',
  'price',
  'assetProfile',
] as const;

interface CacheEntry<T> {
  value: T | null;
  asOf: string;
  negative?: boolean;
}

interface CacheFile {
  entries: Record<string, CacheEntry<unknown>>;
}

export interface YahooFundamentals {
  symbol: string;
  shortName: string | null;
  longName: string | null;
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  weburl: string | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  peTTM: number | null;
  peForward: number | null;
  epsTTM: number | null;
  beta: number | null;
  week52High: number | null;
  week52Low: number | null;
  dividendYieldAnnual: number | null;
  payoutRatio: number | null;
  /** Quarterly YoY revenue growth as a fraction (0.18 = 18%). */
  revenueGrowthQuarterlyYoy: number | null;
  /** Quarterly YoY earnings growth as a fraction. */
  earningsGrowthQuarterlyYoy: number | null;
  nextEarningsDate: string | null;
  nextEarningsEpsEstimate: number | null;
  nextExDividendDate: string | null;
  nextDividendDate: string | null;
  /** Last dividend amount in native currency (Yahoo's `trailingAnnualDividendRate` / 4 is unreliable; we use the latest if reported). */
  lastDividendAmount: number | null;
}

export class YahooFundamentalsService {
  private readonly cachePath: string;
  private cache: CacheFile;
  private crumb: string | null = null;
  private cookie: string | null = null;
  private crumbFetchInFlight: Promise<void> | null = null;

  constructor(dataDir: string) {
    this.cachePath = join(dataDir, 'yahoo-fundamentals-cache.json');
    this.cache = existsSync(this.cachePath)
      ? safeParse(readFileSync(this.cachePath, 'utf-8'))
      : { entries: {} };
  }

  private save(): void {
    try {
      writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch {
      // non-fatal
    }
  }

  private readCache(symbol: string): CacheEntry<YahooFundamentals> | null {
    const raw = this.cache.entries[symbol.toUpperCase()] as
      | CacheEntry<YahooFundamentals>
      | undefined;
    if (!raw) return null;
    const age = Date.now() - new Date(raw.asOf).getTime();
    const ttl = raw.negative ? NEGATIVE_TTL : QUOTE_SUMMARY_TTL;
    if (age < 0 || age > ttl) return null;
    return raw;
  }

  private writeCache(symbol: string, value: YahooFundamentals | null, negative = false): void {
    this.cache.entries[symbol.toUpperCase()] = {
      value,
      asOf: new Date().toISOString(),
      ...(negative ? { negative: true } : {}),
    };
    this.save();
  }

  /**
   * Yahoo's v10 quoteSummary requires a `crumb` query param + the matching
   * `A1` consent cookie. The crumb is per-session and tied to the cookie
   * — losing either invalidates both. We fetch them once and re-use across
   * the whole process; on 401 the caller can call `resetCrumb()` and retry.
   */
  private async ensureCrumb(): Promise<void> {
    if (this.crumb && this.cookie) return;
    if (this.crumbFetchInFlight) return this.crumbFetchInFlight;
    this.crumbFetchInFlight = (async () => {
      try {
        // Step 1: hit fc.yahoo.com to receive the A1 / A3 consent cookie.
        const consent = await fetch('https://fc.yahoo.com/', {
          headers: { 'User-Agent': UA, Accept: 'text/html' },
          redirect: 'manual',
        });
        const setCookie = consent.headers.get('set-cookie') ?? '';
        const cookie = extractCookies(setCookie, ['A1', 'A3', 'A1S']);
        if (!cookie) {
          this.crumb = null;
          this.cookie = null;
          return;
        }
        this.cookie = cookie;

        // Step 2: fetch the crumb string using the consent cookie.
        const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
          headers: { 'User-Agent': UA, Cookie: cookie },
        });
        if (!crumbRes.ok) {
          this.crumb = null;
          this.cookie = null;
          return;
        }
        const crumb = (await crumbRes.text()).trim();
        if (!crumb || crumb.length > 64) {
          this.crumb = null;
          this.cookie = null;
          return;
        }
        this.crumb = crumb;
      } catch {
        this.crumb = null;
        this.cookie = null;
      } finally {
        this.crumbFetchInFlight = null;
      }
    })();
    return this.crumbFetchInFlight;
  }

  private resetCrumb(): void {
    this.crumb = null;
    this.cookie = null;
  }

  async getFundamentals(symbol: string): Promise<YahooFundamentals | null> {
    const trimmed = symbol.trim();
    if (!trimmed) return null;
    const cached = this.readCache(trimmed);
    if (cached) return cached.value;

    try {
      const result = await this.fetchQuoteSummary(trimmed);
      if (!result) {
        this.writeCache(trimmed, null, true);
        return null;
      }
      this.writeCache(trimmed, result);
      return result;
    } catch {
      this.writeCache(trimmed, null, true);
      return null;
    }
  }

  private async fetchQuoteSummary(symbol: string): Promise<YahooFundamentals | null> {
    let attempt = 0;
    while (attempt < 2) {
      await this.ensureCrumb();
      const url = new URL(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`,
      );
      url.searchParams.set('modules', DEFAULT_MODULES.join(','));
      if (this.crumb) url.searchParams.set('crumb', this.crumb);
      const res = await fetch(url.toString(), {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
      });
      if (res.status === 401 || res.status === 403) {
        // Crumb may have rotated — wipe and retry once.
        this.resetCrumb();
        attempt++;
        continue;
      }
      if (!res.ok) {
        return null;
      }
      const json = (await res.json()) as any;
      const result = json?.quoteSummary?.result?.[0];
      if (!result) return null;
      return parseResult(symbol, result);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

function extractCookies(setCookie: string, names: string[]): string | null {
  if (!setCookie) return null;
  // Some runtimes (notably undici) collapse multiple Set-Cookie headers into
  // a single string with commas. Splitting on commas naively breaks cookie
  // expiry dates ("Expires=Tue, 12-Mar-..."), so split on ',' followed by a
  // cookie-name-looking token. This is best-effort; if Yahoo's response
  // shape changes the worst case is we degrade to crumb-less requests
  // (still works for many symbols).
  const cookies: string[] = [];
  for (const part of setCookie.split(/,\s*(?=[A-Za-z0-9_-]+=)/)) {
    const [pair] = part.split(';');
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    if (names.includes(name)) cookies.push(pair.trim());
  }
  return cookies.length > 0 ? cookies.join('; ') : null;
}

interface RawValue {
  raw?: number;
  fmt?: string;
}

function rawNum(v: RawValue | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object' && typeof v.raw === 'number') {
    return Number.isFinite(v.raw) ? v.raw : null;
  }
  return null;
}

function epochToIsoDate(v: RawValue | number | null | undefined): string | null {
  const n = rawNum(v);
  if (n == null) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseResult(symbol: string, result: any): YahooFundamentals {
  const summary = result.summaryDetail ?? {};
  const stats = result.defaultKeyStatistics ?? {};
  const financial = result.financialData ?? {};
  const calendar = result.calendarEvents ?? {};
  const price = result.price ?? {};
  const profile = result.assetProfile ?? {};

  // Earnings calendar lives at calendarEvents.earnings.earningsDate (array,
  // usually one entry for the next scheduled report). Yahoo also exposes
  // `earningsAverage` (estimate) and `earningsHigh/Low`.
  const earnings = calendar.earnings ?? {};
  const earningsDates: any[] = Array.isArray(earnings.earningsDate) ? earnings.earningsDate : [];
  const nextEarningsTs = earningsDates.length > 0 ? earningsDates[0] : null;

  return {
    symbol,
    shortName: price?.shortName ?? null,
    longName: price?.longName ?? null,
    exchange: price?.exchangeName ?? null,
    currency: price?.currency ?? summary.currency ?? null,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    country: profile?.country ?? null,
    weburl: profile?.website ?? null,
    marketCap: rawNum(summary.marketCap ?? price?.marketCap),
    sharesOutstanding: rawNum(stats.sharesOutstanding),
    peTTM: rawNum(summary.trailingPE ?? stats.trailingPE),
    peForward: rawNum(summary.forwardPE ?? stats.forwardPE),
    epsTTM: rawNum(stats.trailingEps),
    beta: rawNum(summary.beta ?? stats.beta),
    week52High: rawNum(summary.fiftyTwoWeekHigh),
    week52Low: rawNum(summary.fiftyTwoWeekLow),
    dividendYieldAnnual: rawNum(summary.dividendYield ?? summary.trailingAnnualDividendYield),
    payoutRatio: rawNum(summary.payoutRatio),
    revenueGrowthQuarterlyYoy: rawNum(financial.revenueGrowth),
    earningsGrowthQuarterlyYoy: rawNum(financial.earningsGrowth ?? stats.earningsQuarterlyGrowth),
    nextEarningsDate: epochToIsoDate(nextEarningsTs),
    nextEarningsEpsEstimate: rawNum(earnings.earningsAverage),
    nextExDividendDate: epochToIsoDate(calendar.exDividendDate ?? summary.exDividendDate),
    nextDividendDate: epochToIsoDate(calendar.dividendDate ?? summary.dividendDate),
    lastDividendAmount: rawNum(summary.lastDividendValue ?? stats.lastDividendValue),
  };
}

function safeParse(text: string): CacheFile {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'entries' in parsed) {
      return parsed as CacheFile;
    }
  } catch {
    // fall through
  }
  return { entries: {} };
}
