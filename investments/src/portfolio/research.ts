import type {
  FinnhubDividend,
  FinnhubEarningsEvent,
  FinnhubMetric,
  FinnhubProfile,
  FinnhubQuote,
  FinnhubService,
} from '../market/finnhub.js';
import type { PortfolioService } from './service.js';
import { allInstruments, getInstrument } from '../config/instruments.js';
import type { WatchlistStore } from './watchlist.js';
import { PriceService } from '../market/prices.js';
import type { YahooFundamentals, YahooFundamentalsService } from '../market/yahoo-fundamentals.js';

/**
 * Research feed. One row per tracked instrument across two sources:
 *   - every open holding in the portfolio (auto, with `Held` badge)
 *   - every watchlist item the user added (with `Watch` badge)
 *
 * Each row is enriched with Finnhub fundamentals + the next upcoming
 * earnings + ex-dividend dates. Missing data is `null`, never throws —
 * the Finnhub free tier has uneven non-US coverage and the UI degrades
 * gracefully to "—" cells.
 *
 * The view also surfaces an aggregated "upcoming events" list (earnings
 * + ex-dividends, next 30 days) so users can spot what's about to move
 * across their whole portfolio + watchlist at a glance.
 */

export type ResearchRowKind = 'holding' | 'watchlist' | 'both';

export interface ResearchRow {
  /** Stable id: instrumentId for holdings, watchlist.id for pure watchlist items. */
  id: string;
  kind: ResearchRowKind;
  finnhubSymbol: string | null;
  yahooSymbol: string | null;
  displayName: string;
  /** Three-letter ISO currency of the primary listing. */
  currency: string | null;
  sector: string | null;
  country: string | null;
  /** Holdings-only: quantity owned (in instrument units). */
  quantity: number | null;
  /** Holdings-only: market value in EUR. */
  marketValueBase: number | null;
  /** Holdings-only: unrealized P&L %. */
  unrealizedPnlPct: number | null;
  /** Latest price (Finnhub if available, else Yahoo via priceSource). */
  price: number | null;
  /** Currency of `price`. */
  priceCurrency: string | null;
  dayChangePct: number | null;
  quote: FinnhubQuote | null;
  metric: FinnhubMetric | null;
  profile: FinnhubProfile | null;
  nextEarnings: FinnhubEarningsEvent | null;
  nextExDividend: FinnhubDividend | null;
  /** Watchlist-only: free-text annotation. */
  notes: string | null;
  /** Watchlist-only: stable id of the watchlist row (so DELETE knows the target). */
  watchlistId: string | null;
  /**
   * Where the fundamentals on this row came from. Useful for the UI to
   * indicate why a row might be sparse:
   *   - `finnhub`   — Finnhub free tier had data (US stocks only)
   *   - `yahoo`     — fell back to Yahoo Finance quoteSummary (most non-US)
   *   - `mixed`     — Finnhub for some fields, Yahoo for others
   *   - `none`      — neither provider returned data
   *   - `disabled`  — no Finnhub key + no Yahoo symbol to query
   */
  fundamentalsSource: 'finnhub' | 'yahoo' | 'mixed' | 'none' | 'disabled';
}

export interface UpcomingEvent {
  rowId: string;
  symbol: string;
  displayName: string;
  date: string;
  daysUntil: number;
  kind: 'earnings' | 'ex-dividend';
  detail: string | null;
}

export interface ResearchPayload {
  asOf: string;
  enabled: boolean;
  reason: string | null;
  rows: ResearchRow[];
  upcoming: UpcomingEvent[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Cap concurrent Finnhub fan-out so a 100-symbol watchlist doesn't trip the 60/min free-tier ceiling. */
const FANOUT_CONCURRENCY = 5;

interface BuildInput {
  finnhubSymbol: string | null;
  yahooSymbol: string | null;
  displayName: string;
  currency: string | null;
  rowId: string;
  kind: ResearchRowKind;
  quantity: number | null;
  marketValueBase: number | null;
  unrealizedPnlPct: number | null;
  notes: string | null;
  watchlistId: string | null;
  holdingPrice: number | null;
  holdingCurrency: string | null;
}

export async function buildResearchFeed(
  portfolio: PortfolioService,
  watchlist: WatchlistStore,
  finnhub: FinnhubService,
  prices: PriceService,
  yahooFundamentals: YahooFundamentalsService,
): Promise<ResearchPayload> {
  const snapshot = await portfolio.getSnapshot();
  const items = watchlist.list();

  // Index curated instrument master so watchlist rows can borrow display
  // name / currency hints when the user only entered a Finnhub symbol.
  const instrumentByYahoo = new Map<string, ReturnType<typeof getInstrument>>();
  for (const inst of allInstruments()) {
    if (inst.priceSource?.provider === 'yahoo') {
      instrumentByYahoo.set(inst.priceSource.symbol.toUpperCase(), inst);
    }
  }

  const buildInputs: BuildInput[] = [];

  for (const h of snapshot.holdings) {
    const inst = getInstrument(h.instrumentId);
    const yahooSymbol =
      inst?.priceSource?.provider === 'yahoo' ? inst.priceSource.symbol : null;
    const finnhubSymbol = guessFinnhubSymbol(yahooSymbol);
    buildInputs.push({
      finnhubSymbol,
      yahooSymbol,
      displayName: h.name || h.symbol,
      currency: h.currency,
      rowId: `holding:${h.instrumentId}`,
      kind: 'holding',
      quantity: h.quantity,
      marketValueBase: h.marketValueBase,
      unrealizedPnlPct: h.unrealizedPnlPct,
      notes: null,
      watchlistId: null,
      holdingPrice: h.marketPrice,
      holdingCurrency: h.currency,
    });
  }

  for (const w of items) {
    // If this watchlist symbol matches a Yahoo-mapped instrument we already
    // surface as a holding, merge them into one row keyed by the holding id.
    const matchByYahoo = w.yahooSymbol
      ? buildInputs.find(b => b.yahooSymbol?.toUpperCase() === w.yahooSymbol!.toUpperCase())
      : undefined;
    if (matchByYahoo) {
      matchByYahoo.kind = 'both';
      matchByYahoo.notes = w.notes;
      matchByYahoo.watchlistId = w.id;
      matchByYahoo.finnhubSymbol = matchByYahoo.finnhubSymbol ?? w.finnhubSymbol;
      continue;
    }
    const fallbackInstrument = w.yahooSymbol
      ? instrumentByYahoo.get(w.yahooSymbol.toUpperCase())
      : undefined;
    buildInputs.push({
      finnhubSymbol: w.finnhubSymbol,
      yahooSymbol: w.yahooSymbol,
      displayName: w.displayName ?? fallbackInstrument?.name ?? w.finnhubSymbol,
      currency: fallbackInstrument?.currency ?? null,
      rowId: `watch:${w.id}`,
      kind: 'watchlist',
      quantity: null,
      marketValueBase: null,
      unrealizedPnlPct: null,
      notes: w.notes,
      watchlistId: w.id,
      holdingPrice: null,
      holdingCurrency: null,
    });
  }

  const rows = await mapWithConcurrency(buildInputs, FANOUT_CONCURRENCY, input =>
    enrichRow(input, finnhub, prices, yahooFundamentals),
  );

  const upcoming = collectUpcoming(rows);

  return {
    asOf: new Date().toISOString(),
    enabled: finnhub.isEnabled(),
    reason: finnhub.isEnabled() ? null : 'FINNHUB_API_KEY not configured',
    rows,
    upcoming,
  };
}

async function enrichRow(
  input: BuildInput,
  finnhub: FinnhubService,
  prices: PriceService,
  yahooFundamentals: YahooFundamentalsService,
): Promise<ResearchRow> {
  const symbol = input.finnhubSymbol;

  const [quote, metric, profile, earnings, dividends, yahooQuote] = await Promise.all([
    symbol ? finnhub.getQuote(symbol) : Promise.resolve(null),
    symbol ? finnhub.getMetrics(symbol) : Promise.resolve(null),
    symbol ? finnhub.getProfile(symbol) : Promise.resolve(null),
    symbol ? finnhub.getEarningsCalendar(symbol) : Promise.resolve([]),
    symbol ? finnhub.getDividends(symbol) : Promise.resolve([]),
    input.yahooSymbol && input.kind === 'watchlist'
      ? prices.get({ provider: 'yahoo', symbol: input.yahooSymbol }).catch(() => null)
      : Promise.resolve(null),
  ]);

  // If Finnhub free-tier returned nothing for the metric / profile /
  // earnings / dividend triplet (the common case for non-US holdings),
  // fall back to Yahoo Finance's quoteSummary endpoint — it covers
  // virtually every Yahoo-listed symbol with no auth and gives us the same
  // five buckets of data (just in a slightly different shape).
  const needsYahooFallback = !!input.yahooSymbol && (
    !metric || !profile || (earnings ?? []).length === 0 || (dividends ?? []).length === 0
  );
  const yfund = needsYahooFallback
    ? await yahooFundamentals.getFundamentals(input.yahooSymbol!)
    : null;

  const todayIso = isoDate(new Date());
  const upcomingEarnings = (earnings ?? [])
    .filter(e => e.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcomingDivs = (dividends ?? [])
    .filter(d => d.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Merge Finnhub + Yahoo fundamentals. Finnhub wins where available
  // (it's purpose-built and has additional fields like 5-year revenue
  // growth); Yahoo plugs the gaps.
  const mergedMetric: FinnhubMetric | null = mergeMetric(metric, yfund);
  const mergedProfile: FinnhubProfile | null = mergeProfile(profile, yfund);
  const nextEarnings: FinnhubEarningsEvent | null =
    upcomingEarnings[0] ?? yahooEarningsToFinnhub(yfund);
  const nextExDividend: FinnhubDividend | null =
    upcomingDivs[0] ?? yahooDividendToFinnhub(yfund);

  const finalPrice =
    quote?.price ?? input.holdingPrice ?? yahooQuote?.price ?? null;
  const finalCurrency =
    mergedProfile?.currency ?? input.holdingCurrency ?? yahooQuote?.currency ?? yfund?.currency ?? input.currency ?? null;

  const displayName =
    mergedProfile?.name ?? yfund?.longName ?? yfund?.shortName ??
    (input.displayName && input.displayName !== input.finnhubSymbol
      ? input.displayName
      : input.displayName ?? input.finnhubSymbol ?? input.yahooSymbol ?? 'Unknown');

  return {
    id: input.rowId,
    kind: input.kind,
    finnhubSymbol: input.finnhubSymbol,
    yahooSymbol: input.yahooSymbol,
    displayName,
    currency: finalCurrency,
    sector: mergedProfile?.industry ?? yfund?.sector ?? null,
    country: mergedProfile?.country ?? yfund?.country ?? null,
    quantity: input.quantity,
    marketValueBase: input.marketValueBase,
    unrealizedPnlPct: input.unrealizedPnlPct,
    price: finalPrice,
    priceCurrency: finalCurrency,
    dayChangePct: quote?.dayChangePct ?? null,
    quote,
    metric: mergedMetric,
    profile: mergedProfile,
    nextEarnings,
    nextExDividend,
    notes: input.notes,
    watchlistId: input.watchlistId,
    fundamentalsSource: classifySource(metric, profile, earnings, dividends, yfund, input),
  };
}

function classifySource(
  metric: FinnhubMetric | null,
  profile: FinnhubProfile | null,
  earnings: FinnhubEarningsEvent[],
  dividends: FinnhubDividend[],
  yfund: YahooFundamentals | null,
  input: BuildInput,
): ResearchRow['fundamentalsSource'] {
  const hasFinnhub = !!metric || !!profile || earnings.length > 0 || dividends.length > 0;
  const hasYahoo = !!yfund;
  if (hasFinnhub && hasYahoo) return 'mixed';
  if (hasFinnhub) return 'finnhub';
  if (hasYahoo) return 'yahoo';
  if (!input.finnhubSymbol && !input.yahooSymbol) return 'disabled';
  return 'none';
}

/**
 * Yahoo's quoteSummary uses different field shapes than Finnhub's
 * `/stock/metric` (raw numbers vs RawValue wrappers, slightly different
 * growth percentages). Translate into the FinnhubMetric shape and let
 * Finnhub's value win when both present a field — it's purpose-built
 * fundamentals, Yahoo is a public-API best-effort.
 */
function mergeMetric(
  fh: FinnhubMetric | null,
  yh: YahooFundamentals | null,
): FinnhubMetric | null {
  if (!fh && !yh) return null;
  return {
    peTTM: fh?.peTTM ?? yh?.peTTM ?? null,
    peForward: fh?.peForward ?? yh?.peForward ?? null,
    epsTTM: fh?.epsTTM ?? yh?.epsTTM ?? null,
    beta: fh?.beta ?? yh?.beta ?? null,
    marketCap: fh?.marketCap ?? yh?.marketCap ?? null,
    week52High: fh?.week52High ?? yh?.week52High ?? null,
    week52Low: fh?.week52Low ?? yh?.week52Low ?? null,
    dividendYieldAnnual: fh?.dividendYieldAnnual ?? yh?.dividendYieldAnnual ?? null,
    payoutRatio: fh?.payoutRatio ?? yh?.payoutRatio ?? null,
    // Yahoo doesn't break out TTM vs Quarterly growth as cleanly as
    // Finnhub does — `financialData.revenueGrowth` is YoY quarterly and
    // there's no clean TTM equivalent in the public response. Use it for
    // both buckets if Finnhub had nothing.
    revenueGrowthTTMYoy: fh?.revenueGrowthTTMYoy ?? yh?.revenueGrowthQuarterlyYoy ?? null,
    revenueGrowth5Y: fh?.revenueGrowth5Y ?? null,
    revenueGrowthQuarterlyYoy: fh?.revenueGrowthQuarterlyYoy ?? yh?.revenueGrowthQuarterlyYoy ?? null,
    epsGrowthTTMYoy: fh?.epsGrowthTTMYoy ?? yh?.earningsGrowthQuarterlyYoy ?? null,
    epsGrowthQuarterlyYoy: fh?.epsGrowthQuarterlyYoy ?? yh?.earningsGrowthQuarterlyYoy ?? null,
  };
}

function mergeProfile(
  fh: FinnhubProfile | null,
  yh: YahooFundamentals | null,
): FinnhubProfile | null {
  if (!fh && !yh) return null;
  return {
    name: fh?.name ?? yh?.longName ?? yh?.shortName ?? null,
    ticker: fh?.ticker ?? yh?.symbol ?? null,
    exchange: fh?.exchange ?? yh?.exchange ?? null,
    country: fh?.country ?? yh?.country ?? null,
    currency: fh?.currency ?? yh?.currency ?? null,
    industry: fh?.industry ?? yh?.industry ?? yh?.sector ?? null,
    ipo: fh?.ipo ?? null,
    logo: fh?.logo ?? null,
    weburl: fh?.weburl ?? yh?.weburl ?? null,
    marketCap: fh?.marketCap ?? yh?.marketCap ?? null,
    shareOutstanding: fh?.shareOutstanding ?? yh?.sharesOutstanding ?? null,
  };
}

function yahooEarningsToFinnhub(yh: YahooFundamentals | null): FinnhubEarningsEvent | null {
  if (!yh?.nextEarningsDate) return null;
  return {
    symbol: yh.symbol,
    date: yh.nextEarningsDate,
    epsEstimate: yh.nextEarningsEpsEstimate,
    epsActual: null,
    revenueEstimate: null,
    revenueActual: null,
    hour: null,
    quarter: null,
    year: null,
  };
}

function yahooDividendToFinnhub(yh: YahooFundamentals | null): FinnhubDividend | null {
  if (!yh?.nextExDividendDate) return null;
  return {
    symbol: yh.symbol,
    date: yh.nextExDividendDate,
    amount: yh.lastDividendAmount ?? 0,
    currency: yh.currency,
    payDate: yh.nextDividendDate,
    recordDate: null,
    declarationDate: null,
  };
}

function collectUpcoming(rows: ResearchRow[]): UpcomingEvent[] {
  const out: UpcomingEvent[] = [];
  const today = startOfDayUtc(new Date());
  const limit = today + 30 * DAY_MS;
  for (const row of rows) {
    if (row.nextEarnings) {
      const ts = startOfDayUtc(new Date(row.nextEarnings.date));
      if (ts >= today && ts <= limit) {
        const est = row.nextEarnings.epsEstimate;
        out.push({
          rowId: row.id,
          symbol: row.finnhubSymbol ?? row.yahooSymbol ?? '?',
          displayName: row.displayName,
          date: row.nextEarnings.date,
          daysUntil: Math.round((ts - today) / DAY_MS),
          kind: 'earnings',
          detail: est != null && Number.isFinite(est) ? `est EPS ${est.toFixed(2)}` : null,
        });
      }
    }
    if (row.nextExDividend) {
      const ts = startOfDayUtc(new Date(row.nextExDividend.date));
      if (ts >= today && ts <= limit) {
        const amt = row.nextExDividend.amount;
        const ccy = row.nextExDividend.currency ?? row.currency ?? '';
        out.push({
          rowId: row.id,
          symbol: row.finnhubSymbol ?? row.yahooSymbol ?? '?',
          displayName: row.displayName,
          date: row.nextExDividend.date,
          daysUntil: Math.round((ts - today) / DAY_MS),
          kind: 'ex-dividend',
          detail: amt > 0 ? `${amt.toFixed(2)} ${ccy}`.trim() : null,
        });
      }
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/**
 * Yahoo and Finnhub use slightly different conventions. For US tickers
 * they're identical; for many European listings Yahoo uses `.DE` / `.PA`
 * etc. while Finnhub uses `.F` / `.PA`. Rather than maintaining a mapping
 * table we use the Yahoo symbol as-is when no Finnhub symbol is provided
 * and let `finnhub.getX()` fall through to a negative cache if it 404s.
 * Watchlist rows always carry an explicit Finnhub symbol so this is only
 * a best-effort hint for holdings.
 */
function guessFinnhubSymbol(yahooSymbol: string | null): string | null {
  if (!yahooSymbol) return null;
  return yahooSymbol;
}

async function mapWithConcurrency<I, O>(
  items: I[],
  concurrency: number,
  fn: (item: I) => Promise<O>,
): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
