import type {
  DividendEvent,
  EarningsEvent,
  InstrumentMetrics,
  InstrumentProfile,
  ResearchPayload,
  ResearchRow,
  ResearchRowKind,
  UpcomingEvent,
} from '../shared/types';
import type { PortfolioService } from './portfolio';
import type { WatchlistStore } from './watchlist';
import type { PriceService } from '../market/prices';
import type { FundamentalsService, YahooFundamentals } from '../market/fundamentals';

/**
 * Research feed. One row per tracked instrument across two sources:
 *   - every open holding in the portfolio (`Held` badge)
 *   - every watchlist item the user added (`Watch` badge)
 *
 * Fundamentals come from Yahoo's `quoteSummary` via `FundamentalsService`.
 * The payload also carries an aggregated upcoming-events list (earnings +
 * ex-dividends, next 30 days).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Cap concurrent Yahoo fan-out so a large watchlist doesn't trip rate limits. */
const FANOUT_CONCURRENCY = 5;

interface BuildInput {
  symbol: string | null;
  displayName: string;
  currency: string | null;
  rowId: string;
  kind: ResearchRowKind;
  quantity: number | null;
  valueEur: number | null;
  gainPct: number | null;
  notes: string | null;
  watchlistId: string | null;
  holdingPrice: number | null;
  holdingCurrency: string | null;
}

export async function buildResearchFeed(
  portfolio: PortfolioService,
  watchlist: WatchlistStore,
  prices: PriceService,
  fundamentals: FundamentalsService,
): Promise<ResearchPayload> {
  const snapshot = await portfolio.getPortfolio();
  const items = watchlist.list();

  // Index the instrument master by Yahoo symbol so watchlist rows can borrow
  // display name / currency hints when the user only entered a symbol.
  const instrumentByYahoo = new Map<string, { name: string; currency: string }>();
  for (const inst of portfolio.instruments.all()) {
    if (inst.yahooSymbol) {
      instrumentByYahoo.set(inst.yahooSymbol.toUpperCase(), {
        name: inst.name,
        currency: inst.currency,
      });
    }
  }

  const buildInputs: BuildInput[] = [];

  for (const h of snapshot.holdings) {
    const yahooSymbol = portfolio.instruments.get(h.instrumentId)?.yahooSymbol ?? null;
    buildInputs.push({
      symbol: yahooSymbol,
      displayName: h.name || h.symbol,
      currency: h.currency,
      rowId: `holding:${h.instrumentId}`,
      kind: 'holding',
      quantity: h.quantity,
      valueEur: h.valueEur,
      gainPct: h.priced ? h.gainPct : null,
      notes: null,
      watchlistId: null,
      holdingPrice: h.priceNative,
      holdingCurrency: h.currency,
    });
  }

  for (const w of items) {
    // Merge with an existing holding row when the symbols match — keeps
    // "held + on watch" as one row rather than two.
    const matchByHolding = buildInputs.find(
      b => b.symbol?.toUpperCase() === w.symbol.toUpperCase(),
    );
    if (matchByHolding) {
      matchByHolding.kind = 'both';
      matchByHolding.notes = w.notes;
      matchByHolding.watchlistId = w.id;
      continue;
    }
    const fallback = instrumentByYahoo.get(w.symbol.toUpperCase());
    buildInputs.push({
      symbol: w.symbol,
      displayName: w.displayName ?? fallback?.name ?? w.symbol,
      currency: fallback?.currency ?? null,
      rowId: `watch:${w.id}`,
      kind: 'watchlist',
      quantity: null,
      valueEur: null,
      gainPct: null,
      notes: w.notes,
      watchlistId: w.id,
      holdingPrice: null,
      holdingCurrency: null,
    });
  }

  const rows = await mapWithConcurrency(buildInputs, FANOUT_CONCURRENCY, input =>
    enrichRow(input, fundamentals, prices),
  );

  return {
    asOf: new Date().toISOString(),
    rows,
    upcoming: collectUpcoming(rows),
  };
}

async function enrichRow(
  input: BuildInput,
  fundamentals: FundamentalsService,
  prices: PriceService,
): Promise<ResearchRow> {
  const symbol = input.symbol;

  const [yfund, quote] = await Promise.all([
    symbol ? fundamentals.getFundamentals(symbol) : Promise.resolve(null),
    // Watchlist-only rows have no holding-side price; fall back to the
    // shared PriceService so the price column populates even when
    // quoteSummary doesn't expose `regularMarketPrice`.
    symbol && input.kind === 'watchlist'
      ? prices.get(symbol).catch(() => null)
      : Promise.resolve(null),
  ]);

  const metrics = toMetrics(yfund);
  const profile = toProfile(yfund);

  const finalPrice = yfund?.price ?? input.holdingPrice ?? quote?.price ?? null;
  const finalCurrency =
    profile?.currency ?? input.holdingCurrency ?? quote?.currency ?? input.currency ?? null;

  return {
    id: input.rowId,
    kind: input.kind,
    symbol: input.symbol,
    displayName: profile?.name ?? input.displayName,
    currency: finalCurrency,
    sector: profile?.industry ?? profile?.sector ?? null,
    country: profile?.country ?? null,
    quantity: input.quantity,
    valueEur: input.valueEur,
    gainPct: input.gainPct,
    price: finalPrice,
    priceCurrency: finalCurrency,
    dayChangePct: yfund?.dayChangePct ?? null,
    metrics,
    profile,
    nextEarnings: toEarnings(yfund),
    nextExDividend: toDividend(yfund),
    notes: input.notes,
    watchlistId: input.watchlistId,
  };
}

function toMetrics(yh: YahooFundamentals | null): InstrumentMetrics | null {
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

function toProfile(yh: YahooFundamentals | null): InstrumentProfile | null {
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

function toEarnings(yh: YahooFundamentals | null): EarningsEvent | null {
  if (!yh?.nextEarningsDate) return null;
  return { date: yh.nextEarningsDate, epsEstimate: yh.nextEarningsEpsEstimate };
}

function toDividend(yh: YahooFundamentals | null): DividendEvent | null {
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
