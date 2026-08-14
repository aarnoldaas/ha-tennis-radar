import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AllocationSlice,
  Broker,
  Holding,
  IncomeRow,
  Lot,
  Portfolio,
  Sale,
  TradeRef,
  Transaction,
  UnmappedSymbol,
} from '../shared/types';
import { BROKER_KEYS } from '../shared/brokers';
import type { RawTx } from './parse/raw';
import { parseSwedbank } from './parse/swedbank';
import { parseInteractiveBrokers } from './parse/ib';
import type { InstrumentStore } from './instruments';
import type { FxService } from '../market/fx';

/**
 * The data pipeline: pure functions from raw broker files to the public
 * entities. Each step takes plain inputs and returns plain outputs — no
 * mutation of previously returned values, no hidden state.
 *
 *   loadRaw → normalize → buildLots → buildHoldings / buildIncome / buildAllocation
 *                                   → buildPortfolio
 */

// ---------------------------------------------------------------------------
// loadRaw — walk broker dirs, parse, dedupe by id
// ---------------------------------------------------------------------------

const PARSERS: Record<Broker, (text: string, sourceFile: string) => RawTx[]> = {
  swedbank: parseSwedbank,
  'interactive-brokers': parseInteractiveBrokers,
};

export function loadRaw(dataDir: string): RawTx[] {
  const root = join(dataDir, 'Investments');
  const byId = new Map<string, RawTx>();

  for (const broker of BROKER_KEYS) {
    const brokerDir = join(root, broker);
    if (!existsSync(brokerDir)) continue;
    for (const name of readdirSync(brokerDir)) {
      if (name.startsWith('.')) continue;
      const full = join(brokerDir, name);
      try {
        if (!statSync(full).isFile()) continue;
      } catch {
        continue;
      }
      let parsed: RawTx[] = [];
      try {
        parsed = PARSERS[broker](readFileSync(full, 'utf-8'), name);
      } catch {
        parsed = [];
      }
      // Dedupe by stable id — overlapping year exports collapse naturally.
      for (const tx of parsed) {
        if (!byId.has(tx.id)) byId.set(tx.id, tx);
      }
    }
  }

  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// normalize — resolve instruments, convert to EUR, fold withholding tax
// ---------------------------------------------------------------------------

export interface NormalizeResult {
  /** Ascending by (date, id). */
  transactions: Transaction[];
  unmapped: UnmappedSymbol[];
}

export function normalize(
  raw: RawTx[],
  instruments: InstrumentStore,
  fx: FxService,
): NormalizeResult {
  const unmappedMap = new Map<string, UnmappedSymbol>();
  const transactions: Transaction[] = [];
  const taxRows: Array<{ raw: RawTx; instrumentKey: string | null; amountEur: number }> = [];

  for (const r of raw) {
    const instrumentId = instruments.resolve(r.broker, r.rawSymbol, r.isin);
    const instrument = instrumentId ? instruments.get(instrumentId) : undefined;

    if (
      !instrumentId &&
      r.rawSymbol &&
      (r.type === 'buy' || r.type === 'sell' || r.type === 'dividend' || r.type === 'tax')
    ) {
      const key = `${r.broker}::${r.rawSymbol.toUpperCase()}`;
      const existing = unmappedMap.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.isin && r.isin) existing.isin = r.isin;
      } else {
        unmappedMap.set(key, {
          broker: r.broker,
          rawSymbol: r.rawSymbol,
          isin: r.isin,
          count: 1,
        });
      }
    }

    const toEur = (value: number): number =>
      r.amountIsEur ? value : fx.toBase(value, r.currency, r.date);

    if (r.type === 'tax') {
      // Collected for the folding pass below — tax rows don't survive as
      // transactions unless no dividend/interest counterpart exists.
      taxRows.push({
        raw: r,
        instrumentKey: instrumentId ?? r.rawSymbol?.toUpperCase() ?? null,
        amountEur: toEur(r.amount),
      });
      continue;
    }

    const isTrade = r.type === 'buy' || r.type === 'sell';
    // Trades re-derive the EUR cash effect from qty × price at the trade-date
    // ECB rate so cost basis is consistent across brokers regardless of how
    // the statement reports cash.
    const amountEur = isTrade
      ? fx.toBase(-(r.quantity ?? 0) * (r.price ?? 0), r.currency, r.date)
      : toEur(r.amount);

    const isIncome = r.type === 'dividend' || r.type === 'interest';
    let grossEur: number | null = null;
    let taxEur: number | null = null;
    if (isIncome) {
      if (r.gross != null && r.tax != null) {
        // Swedbank: statement amount is net; gross/tax were backed out of the
        // withholding % at parse time.
        grossEur = toEur(r.gross);
        taxEur = toEur(r.tax);
      } else {
        // IB: the dividend/interest row is gross; withholding arrives as
        // separate tax rows folded in below.
        grossEur = amountEur;
        taxEur = 0;
      }
    }

    transactions.push({
      id: r.id,
      broker: r.broker,
      date: r.date,
      type: r.type,
      instrumentId,
      symbol: instrument?.symbol ?? r.rawSymbol ?? null,
      quantity: r.quantity,
      priceNative: r.price,
      currency: r.currency,
      amountEur,
      grossEur,
      taxEur,
      note: r.note,
      sourceFile: r.sourceFile,
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  foldTaxRows(taxRows, transactions, instruments);

  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  return {
    transactions,
    unmapped: [...unmappedMap.values()].sort((a, b) => b.count - a.count),
  };
}

/**
 * Fold raw withholding-tax rows into their paying transaction:
 *
 *   - symbol-bearing tax rows fold into a `dividend` of the same instrument
 *     (same date preferred, else the closest dividend in the same year);
 *   - symbolless tax rows are interest withholding and fold into an
 *     `interest` row of the same broker the same way.
 *
 * The receiving transaction's `taxEur` grows and its `amountEur` shrinks so
 * it stays the signed net cash effect. Tax rows with no counterpart become
 * `fee` transactions — nothing is silently dropped.
 */
function foldTaxRows(
  taxRows: Array<{ raw: RawTx; instrumentKey: string | null; amountEur: number }>,
  transactions: Transaction[],
  instruments: InstrumentStore,
): void {
  for (const tax of taxRows) {
    const { raw } = tax;
    const wantType = tax.instrumentKey ? 'dividend' : 'interest';
    const year = raw.date.slice(0, 4);

    const candidates = transactions.filter(t => {
      if (t.type !== wantType || t.broker !== raw.broker) return false;
      if (t.date.slice(0, 4) !== year) return false;
      if (!tax.instrumentKey) return true;
      const key = t.instrumentId ?? t.symbol?.toUpperCase() ?? null;
      return key === tax.instrumentKey;
    });

    let target: Transaction | undefined = candidates.find(t => t.date === raw.date);
    if (!target && candidates.length > 0) {
      // Closest by date within the year, preferring earlier (the payout the
      // withholding belongs to almost always precedes or matches its date).
      target = [...candidates].sort((a, b) => {
        const da = Math.abs(Date.parse(a.date) - Date.parse(raw.date));
        const db = Math.abs(Date.parse(b.date) - Date.parse(raw.date));
        return da - db || a.date.localeCompare(b.date);
      })[0];
    }

    if (target) {
      const taxAmount = -tax.amountEur; // tax rows are negative cash — flip to positive
      target.taxEur = (target.taxEur ?? 0) + taxAmount;
      target.amountEur -= taxAmount;
    } else {
      const instrumentId = instruments.resolve(raw.broker, raw.rawSymbol, raw.isin);
      transactions.push({
        id: raw.id,
        broker: raw.broker,
        date: raw.date,
        type: 'fee',
        instrumentId,
        symbol: instrumentId ? instruments.get(instrumentId)?.symbol ?? null : raw.rawSymbol,
        quantity: null,
        priceNative: null,
        currency: raw.currency,
        amountEur: tax.amountEur,
        grossEur: null,
        taxEur: null,
        note: raw.note,
        sourceFile: raw.sourceFile,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// buildLots — FIFO per (instrumentId, broker)
// ---------------------------------------------------------------------------

export interface LotsResult {
  lots: Lot[];
  sales: Sale[];
}

interface OpenLotState {
  instrumentId: string;
  broker: Broker;
  date: string;
  quantity: number;
  costPerUnitEur: number;
  priceNative: number;
  currency: string;
}

const QTY_EPSILON = 1e-9;

export function buildLots(transactions: Transaction[]): LotsResult {
  const queues = new Map<string, OpenLotState[]>();
  const sales: Sale[] = [];

  for (const tx of transactions) {
    if (!tx.instrumentId) continue;
    if (tx.type !== 'buy' && tx.type !== 'sell') continue;
    if (!tx.quantity || !tx.priceNative) continue;

    const key = `${tx.instrumentId}|${tx.broker}`;
    const queue = queues.get(key) ?? [];
    queues.set(key, queue);

    if (tx.type === 'buy') {
      queue.push({
        instrumentId: tx.instrumentId,
        broker: tx.broker,
        date: tx.date,
        quantity: tx.quantity,
        // amountEur is -qty·price/fx at trade date, so per-unit EUR cost is
        // simply the (positive) cash out divided by the shares in.
        costPerUnitEur: -tx.amountEur / tx.quantity,
        priceNative: tx.priceNative,
        currency: tx.currency,
      });
      continue;
    }

    const soldQty = Math.abs(tx.quantity);
    const proceedsPerUnitEur = tx.amountEur / soldQty;
    let remaining = soldQty;
    while (remaining > QTY_EPSILON && queue.length > 0) {
      const head = queue[0];
      const take = Math.min(head.quantity, remaining);
      const proceedsEur = take * proceedsPerUnitEur;
      const costEur = take * head.costPerUnitEur;
      sales.push({
        instrumentId: tx.instrumentId,
        symbol: tx.symbol ?? tx.instrumentId,
        broker: tx.broker,
        buyDate: head.date,
        sellDate: tx.date,
        quantity: take,
        proceedsEur,
        costEur,
        gainEur: proceedsEur - costEur,
        holdingDays: daysBetween(head.date, tx.date),
      });
      head.quantity -= take;
      remaining -= take;
      if (head.quantity <= QTY_EPSILON) queue.shift();
    }
  }

  const lots: Lot[] = [];
  for (const queue of queues.values()) {
    for (const lot of queue) {
      if (lot.quantity <= QTY_EPSILON) continue;
      lots.push({
        instrumentId: lot.instrumentId,
        broker: lot.broker,
        date: lot.date,
        quantity: lot.quantity,
        costEur: lot.quantity * lot.costPerUnitEur,
        priceNative: lot.priceNative,
        currency: lot.currency,
      });
    }
  }

  return { lots, sales };
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z');
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

// ---------------------------------------------------------------------------
// buildHoldings — one pass, fully priced at construction
// ---------------------------------------------------------------------------

export interface InstrumentQuote {
  price: number;
  currency: string;
  asOf: string | null;
}

export function buildHoldings(
  lots: Lot[],
  transactions: Transaction[],
  instruments: InstrumentStore,
  quotes: Map<string, InstrumentQuote>,
  fx: FxService,
): Holding[] {
  const byInstrument = new Map<string, Lot[]>();
  for (const lot of lots) {
    const arr = byInstrument.get(lot.instrumentId) ?? [];
    arr.push(lot);
    byInstrument.set(lot.instrumentId, arr);
  }

  const lastTrades = buildLastTradeIndex(transactions);

  const holdings: Holding[] = [];
  for (const [instrumentId, instrumentLots] of byInstrument) {
    const instrument = instruments.get(instrumentId);
    if (!instrument) continue;

    let quantity = 0;
    let costEur = 0;
    for (const lot of instrumentLots) {
      quantity += lot.quantity;
      costEur += lot.costEur;
    }
    if (quantity <= QTY_EPSILON) continue;

    const quote = quotes.get(instrumentId) ?? null;
    const priced = quote != null;
    const valueEur = priced
      ? fx.toBaseLatest(quote.price * quantity, quote.currency)
      : costEur;
    const gainEur = priced ? valueEur - costEur : 0;

    holdings.push({
      instrumentId,
      symbol: instrument.symbol,
      name: instrument.name,
      assetClass: instrument.assetClass,
      currency: instrument.currency,
      quantity,
      costEur,
      avgCostEur: costEur / quantity,
      priced,
      priceNative: quote?.price ?? null,
      priceAsOf: quote?.asOf ?? null,
      valueEur,
      gainEur,
      gainPct: priced && costEur > 0 ? gainEur / costEur : 0,
      lastBuy: lastTrades.get(`${instrumentId}|buy`) ?? null,
      lastSell: lastTrades.get(`${instrumentId}|sell`) ?? null,
    });
  }

  holdings.sort((a, b) => b.valueEur - a.valueEur);
  return holdings;
}

function buildLastTradeIndex(transactions: Transaction[]): Map<string, TradeRef> {
  const out = new Map<string, TradeRef>();
  for (const tx of transactions) {
    if (!tx.instrumentId) continue;
    if (tx.type !== 'buy' && tx.type !== 'sell') continue;
    if (!tx.quantity || !tx.priceNative) continue;
    const key = `${tx.instrumentId}|${tx.type}`;
    const existing = out.get(key);
    if (existing && existing.date >= tx.date) continue;
    out.set(key, {
      date: tx.date,
      broker: tx.broker,
      quantity: Math.abs(tx.quantity),
      priceNative: tx.priceNative,
      currency: tx.currency,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// buildIncome — trivial group-by now that tax is folded
// ---------------------------------------------------------------------------

export function buildIncome(transactions: Transaction[]): IncomeRow[] {
  const map = new Map<string, IncomeRow>();

  for (const tx of transactions) {
    if (tx.type !== 'dividend' && tx.type !== 'interest') continue;
    const year = Number(tx.date.slice(0, 4));
    if (!Number.isFinite(year)) continue;

    const key = [tx.instrumentId ?? tx.symbol ?? '__cash__', tx.broker, year, tx.type].join('|');
    const row = map.get(key) ?? {
      year,
      type: tx.type,
      instrumentId: tx.instrumentId,
      symbol: tx.symbol,
      broker: tx.broker,
      grossEur: 0,
      taxEur: 0,
      netEur: 0,
    };
    row.grossEur += tx.grossEur ?? tx.amountEur;
    row.taxEur += tx.taxEur ?? 0;
    row.netEur += tx.amountEur;
    map.set(key, row);
  }

  return [...map.values()].sort((a, b) => b.year - a.year || b.netEur - a.netEur);
}

// ---------------------------------------------------------------------------
// buildAllocation
// ---------------------------------------------------------------------------

export function buildAllocation(holdings: Holding[]): Portfolio['allocation'] {
  const byClass = new Map<string, number>();
  const byCurrency = new Map<string, number>();
  for (const h of holdings) {
    if (h.valueEur <= 0) continue;
    byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + h.valueEur);
    byCurrency.set(h.currency, (byCurrency.get(h.currency) ?? 0) + h.valueEur);
  }
  return { assetClass: toSlices(byClass), currency: toSlices(byCurrency) };
}

function toSlices(map: Map<string, number>): AllocationSlice[] {
  const total = [...map.values()].reduce((s, v) => s + v, 0);
  return [...map.entries()]
    .map(([label, valueEur]) => ({
      label,
      valueEur,
      pct: total > 0 ? valueEur / total : 0,
    }))
    .sort((a, b) => b.valueEur - a.valueEur);
}

// ---------------------------------------------------------------------------
// buildPortfolio — totals + assembly
// ---------------------------------------------------------------------------

export function buildPortfolio(input: {
  asOf: string;
  transactions: Transaction[];
  holdings: Holding[];
  income: IncomeRow[];
  sales: Sale[];
  unmapped: UnmappedSymbol[];
}): Portfolio {
  const { transactions, holdings, income, sales, unmapped } = input;
  const year = Number(input.asOf.slice(0, 4));

  const valueEur = holdings.reduce((s, h) => s + h.valueEur, 0);
  const costEur = holdings.reduce((s, h) => s + h.costEur, 0);
  const gainEur = holdings.reduce((s, h) => s + h.gainEur, 0);

  let depositsEur = 0;
  let withdrawalsEur = 0;
  for (const tx of transactions) {
    if (tx.type === 'deposit') depositsEur += tx.amountEur;
    if (tx.type === 'withdrawal') withdrawalsEur += -tx.amountEur;
  }

  return {
    asOf: input.asOf,
    totals: {
      valueEur,
      costEur,
      gainEur,
      gainPct: costEur > 0 ? gainEur / costEur : 0,
      realizedYtdEur: sales
        .filter(s => Number(s.sellDate.slice(0, 4)) === year)
        .reduce((s, r) => s + r.gainEur, 0),
      incomeYtdEur: income
        .filter(i => i.year === year)
        .reduce((s, i) => s + i.netEur, 0),
      depositsEur,
      withdrawalsEur,
    },
    holdings,
    income,
    sales: [...sales].sort((a, b) => b.sellDate.localeCompare(a.sellDate)),
    allocation: buildAllocation(holdings),
    unmapped,
  };
}
