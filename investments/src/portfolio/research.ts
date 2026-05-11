import type { PortfolioService } from './service.js';
import { allInstruments, getInstrument } from '../config/instruments.js';
import type { WatchlistStore } from './watchlist.js';
import { PriceService } from '../market/prices.js';
import type {
  YahooFundamentals,
  YahooFundamentalsService,
} from '../market/yahoo-fundamentals.js';

/**
 * Research feed. One row per tracked instrument across two sources:
 *   - every open holding in the portfolio (auto, with `Held` badge)
 *   - every watchlist item the user added (with `Watch` badge)
 *
 * Fundamentals come from Yahoo Finance's `quoteSummary` endpoint via
 * `YahooFundamentalsService`. No upstream account / API key required.
 *
 * The view also surfaces an aggregated "upcoming events" list (earnings
 * + ex-dividends, next 30 days) so users can spot what's about to move
 * across their whole portfolio + watchlist at a glance.
 */

export type ResearchRowKind = 'holding' | 'watchlist' | 'both';

export interface InstrumentMetrics {
  peTTM: number | null;
  peForward: number | null;
  epsTTM: number | null;
  beta: number | null;
  marketCap: number | null;
  week52High: number | null;
  week52Low: number | null;
  /** Annualised dividend yield as a fraction (0.025 = 2.5%). */
  dividendYieldAnnual: number | null;
  payoutRatio: number | null;
  /** Most-recent-quarter YoY revenue growth as a fraction. */
  revenueGrowthYoy: number | null;
  /** Most-recent-quarter YoY earnings growth as a fraction. */
  earningsGrowthYoy: number | null;
}

export interface InstrumentProfile {
  name: string | null;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  weburl: string | null;
  sharesOutstanding: number | null;
}

export interface EarningsEvent {
  date: string;
  epsEstimate: number | null;
}

export interface DividendEvent {
  /** Ex-dividend date. */
  date: string;
  amount: number;
  currency: string | null;
  payDate: string | null;
}

export interface ResearchRow {
  /** Stable id: instrumentId for holdings, watchlist.id for pure watchlist items. */
  id: string;
  kind: ResearchRowKind;
  /** Yahoo-format symbol (e.g. `AAPL`, `NOVO-B.CO`, `IGN1L.VS`). The single source of truth for upstream lookups. */
  symbol: string | null;
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
  /** Latest price (Yahoo regular-market price; falls back to holding price). */
  price: number | null;
  priceCurrency: string | null;
  dayChangePct: number | null;
  metrics: InstrumentMetrics | null;
  profile: InstrumentProfile | null;
  nextEarnings: EarningsEvent | null;
  nextExDividend: DividendEvent | null;
  /** Watchlist-only: free-text annotation. */
  notes: string | null;
  /** Watchlist-only: stable id of the watchlist row (so DELETE knows the target). */
  watchlistId: string | null;
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
  rows: ResearchRow[];
  upcoming: UpcomingEvent[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Cap concurrent Yahoo fan-out so a 100-symbol watchlist doesn't trip rate limits. */
const FANOUT_CONCURRENCY = 5;

interface BuildInput {
  symbol: string | null;
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
  prices: PriceService,
  yahooFundamentals: YahooFundamentalsService,
): Promise<ResearchPayload> {
  const snapshot = await portfolio.getSnapshot();
  const items = watchlist.list();

  // Index curated instrument master so watchlist rows can borrow display
  // name / currency hints when the user only entered a symbol.
  const instrumentBySymbol = new Map<string, ReturnType<typeof getInstrument>>();
  for (const inst of allInstruments()) {
    if (inst.priceSource?.provider === 'yahoo') {
      instrumentBySymbol.set(inst.priceSource.symbol.toUpperCase(), inst);
    }
  }

  const buildInputs: BuildInput[] = [];

  for (const h of snapshot.holdings) {
    const inst = getInstrument(h.instrumentId);
    const symbol = inst?.priceSource?.provider === 'yahoo' ? inst.priceSource.symbol : null;
    buildInputs.push({
      symbol,
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
    // Merge with an existing holding row when the symbols match — keeps
    // "Apple held + on watch" as one row rather than two.
    const matchByHolding = buildInputs.find(
      b => b.symbol?.toUpperCase() === w.symbol.toUpperCase(),
    );
    if (matchByHolding) {
      matchByHolding.kind = 'both';
      matchByHolding.notes = w.notes;
      matchByHolding.watchlistId = w.id;
      continue;
    }
    const fallbackInstrument = instrumentBySymbol.get(w.symbol.toUpperCase());
    buildInputs.push({
      symbol: w.symbol,
      displayName: w.displayName ?? fallbackInstrument?.name ?? w.symbol,
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
    enrichRow(input, yahooFundamentals, prices),
  );

  const upcoming = collectUpcoming(rows);

  return {
    asOf: new Date().toISOString(),
    rows,
    upcoming,
  };
}

async function enrichRow(
  input: BuildInput,
  yahooFundamentals: YahooFundamentalsService,
  prices: PriceService,
): Promise<ResearchRow> {
  const symbol = input.symbol;

  const [yfund, yahooQuote] = await Promise.all([
    symbol ? yahooFundamentals.getFundamentals(symbol) : Promise.resolve(null),
    // For watchlist-only rows we don't already have a holding-side price.
    // Fall back to the existing PriceService (which the rest of the addon
    // already uses) so the price column populates even when quoteSummary
    // is slow or doesn't expose `regularMarketPrice`.
    symbol && input.kind === 'watchlist'
      ? prices.get({ provider: 'yahoo', symbol }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const metrics = yahooToMetrics(yfund);
  const profile = yahooToProfile(yfund);
  const nextEarnings = yahooToEarnings(yfund);
  const nextExDividend = yahooToDividend(yfund);

  const finalPrice =
    yfund?.price ?? input.holdingPrice ?? yahooQuote?.price ?? null;
  const finalCurrency =
    profile?.currency ?? input.holdingCurrency ?? yahooQuote?.currency ?? input.currency ?? null;

  const displayName =
    profile?.name ??
    (input.displayName && input.displayName !== input.symbol
      ? input.displayName
      : input.displayName ?? input.symbol ?? 'Unknown');

  return {
    id: input.rowId,
    kind: input.kind,
    symbol: input.symbol,
    displayName,
    currency: finalCurrency,
    sector: profile?.industry ?? profile?.sector ?? null,
    country: profile?.country ?? null,
    quantity: input.quantity,
    marketValueBase: input.marketValueBase,
    unrealizedPnlPct: input.unrealizedPnlPct,
    price: finalPrice,
    priceCurrency: finalCurrency,
    dayChangePct: yfund?.dayChangePct ?? null,
    metrics,
    profile,
    nextEarnings,
    nextExDividend,
    notes: input.notes,
    watchlistId: input.watchlistId,
  };
}

function yahooToMetrics(yh: YahooFundamentals | null): InstrumentMetrics | null {
  if (!yh) return null;
  return {
    peTTM: yh.peTTM,
    peForward: yh.peForward,
    epsTTM: yh.epsTTM,
    beta: yh.beta,
    marketCap: yh.marketCap,
    week52High: yh.week52High,
    week52Low: yh.week52Low,
    dividendYieldAnnual: yh.dividendYieldAnnual,
    payoutRatio: yh.payoutRatio,
    revenueGrowthYoy: yh.revenueGrowthYoy,
    earningsGrowthYoy: yh.earningsGrowthYoy,
  };
}

function yahooToProfile(yh: YahooFundamentals | null): InstrumentProfile | null {
  if (!yh) return null;
  return {
    name: yh.longName ?? yh.shortName,
    exchange: yh.exchange,
    country: yh.country,
    currency: yh.currency,
    sector: yh.sector,
    industry: yh.industry,
    weburl: yh.weburl,
    sharesOutstanding: yh.sharesOutstanding,
  };
}

function yahooToEarnings(yh: YahooFundamentals | null): EarningsEvent | null {
  if (!yh?.nextEarningsDate) return null;
  return {
    date: yh.nextEarningsDate,
    epsEstimate: yh.nextEarningsEpsEstimate,
  };
}

function yahooToDividend(yh: YahooFundamentals | null): DividendEvent | null {
  if (!yh?.nextExDividendDate) return null;
  return {
    date: yh.nextExDividendDate,
    amount: yh.lastDividendAmount ?? 0,
    currency: yh.currency,
    payDate: yh.nextDividendDate,
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
          symbol: row.symbol ?? '?',
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
          symbol: row.symbol ?? '?',
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

function startOfDayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
