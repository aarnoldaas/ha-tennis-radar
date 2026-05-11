import type {
  BrokerKey,
  MergedHolding,
  OpenLot,
  RealizedLotMatch,
  TradeSummary,
  Transaction,
} from '../parsers/types.js';
import { getInstrument } from '../config/instruments.js';
import type { FxService } from '../market/fx.js';

/**
 * Walk the ledger in chronological order and apply FIFO lot matching within
 * each `(instrumentId, broker)` pair. Produces both open lots (for holdings)
 * and realized-P&L rows (for the Realized tab in the instrument detail).
 *
 * Cost basis is tracked in both native currency and base EUR. FX is applied
 * at trade date so a USD cost basis locks in the EUR rate that day.
 *
 * Transactions with a null `instrumentId` cannot be matched to an instrument
 * and are skipped. Cash is not tracked anywhere in the system.
 */

export interface LotBuildResult {
  openLots: OpenLot[];
  realized: RealizedLotMatch[];
}

export function buildLots(transactions: Transaction[], fx: FxService): LotBuildResult {
  const queues = new Map<string, OpenLot[]>();
  const realized: RealizedLotMatch[] = [];

  const key = (instrumentId: string, broker: BrokerKey) => `${instrumentId}|${broker}`;

  for (const tx of transactions) {
    if (!tx.instrumentId) continue;
    if (tx.kind !== 'buy' && tx.kind !== 'sell') continue;
    if (!tx.quantity || !tx.price) continue;

    const k = key(tx.instrumentId, tx.broker);
    const q = queues.get(k) ?? [];

    if (tx.kind === 'buy') {
      const fxToBase = fx.rateOn(tx.currency, tx.timestamp);
      q.push({
        instrumentId: tx.instrumentId,
        broker: tx.broker,
        acquiredAt: tx.timestamp,
        quantity: tx.quantity,
        costPerUnit: tx.price,
        costCurrency: tx.currency,
        fxToBase,
        costPerUnitBase: tx.price / fxToBase,
        sourceTxId: tx.id,
      });
      queues.set(k, q);
      continue;
    }

    let remaining = Math.abs(tx.quantity);
    while (remaining > 0 && q.length > 0) {
      const head = q[0];
      const take = Math.min(head.quantity, remaining);
      const proceedsNative = take * tx.price;
      const fxSell = fx.rateOn(tx.currency, tx.timestamp);
      const proceedsBase = proceedsNative / fxSell;
      const costBasisBase = take * head.costPerUnitBase;

      const acquired = new Date(head.acquiredAt + 'T00:00:00');
      const sold = new Date(tx.timestamp + 'T00:00:00');
      const holdingDays = Math.max(
        0,
        Math.floor((sold.getTime() - acquired.getTime()) / (1000 * 60 * 60 * 24)),
      );

      realized.push({
        instrumentId: tx.instrumentId,
        symbol: tx.rawSymbol ?? tx.instrumentId,
        broker: tx.broker,
        acquiredAt: head.acquiredAt,
        soldAt: tx.timestamp,
        quantity: take,
        proceedsBase,
        costBasisBase,
        realizedPnlBase: proceedsBase - costBasisBase,
        holdingDays,
        currency: tx.currency,
      });

      head.quantity -= take;
      remaining -= take;
      if (head.quantity <= 1e-9) q.shift();
    }
    queues.set(k, q);
  }

  const openLots: OpenLot[] = [];
  for (const q of queues.values()) {
    for (const lot of q) {
      if (lot.quantity > 1e-9) openLots.push(lot);
    }
  }

  return { openLots, realized };
}

/**
 * Collapse open lots into one row per instrument. Per-broker breakdowns are
 * available on the instrument detail modal via the lot list, so we don't
 * surface a separate broker dimension here.
 *
 * `transactions` lets us populate the per-row `lastBuy` / `lastSell`
 * summaries surfaced in the Holdings table. They're derived directly from
 * the canonical ledger so they reflect the actual broker-reported trade
 * (timestamp + native price + qty), not the FIFO lot view.
 */
export function mergeLotsIntoHoldings(
  openLots: OpenLot[],
  transactions: Transaction[] = [],
): MergedHolding[] {
  const byInstrument = new Map<string, OpenLot[]>();
  for (const lot of openLots) {
    const arr = byInstrument.get(lot.instrumentId) ?? [];
    arr.push(lot);
    byInstrument.set(lot.instrumentId, arr);
  }

  const lastByKind = buildLastTradeIndex(transactions);

  const holdings: MergedHolding[] = [];
  for (const [instrumentId, lots] of byInstrument) {
    const inst = getInstrument(instrumentId);
    if (!inst) continue;

    let totalQty = 0;
    let totalCostNative = 0;
    let totalCostBase = 0;

    for (const lot of lots) {
      totalQty += lot.quantity;
      totalCostNative += lot.quantity * lot.costPerUnit;
      totalCostBase += lot.quantity * lot.costPerUnitBase;
    }

    if (totalQty <= 1e-9) continue;

    const firstAlias = Object.values(inst.aliases)[0];
    const symbol = firstAlias
      ? Array.isArray(firstAlias)
        ? firstAlias[0]
        : firstAlias
      : instrumentId;

    holdings.push({
      instrumentId,
      symbol,
      name: inst.name,
      assetClass: inst.assetClass,
      currency: inst.currency,
      quantity: totalQty,
      avgCost: totalCostNative / totalQty,
      avgCostBase: totalCostBase / totalQty,
      costBasisBase: totalCostBase,
      marketPrice: null,
      marketValueBase: null,
      unrealizedPnlBase: null,
      unrealizedPnlPct: null,
      lastBuy: lastByKind.get(`${instrumentId}|buy`) ?? null,
      lastSell: lastByKind.get(`${instrumentId}|sell`) ?? null,
    });
  }

  holdings.sort((a, b) => b.costBasisBase - a.costBasisBase);
  return holdings;
}

/**
 * Single-pass scan of the ledger for the most recent buy + sell per
 * instrument. Keyed by `${instrumentId}|${kind}` so we can look both up in
 * O(1) inside the per-instrument merge loop.
 */
function buildLastTradeIndex(transactions: Transaction[]): Map<string, TradeSummary> {
  const out = new Map<string, TradeSummary>();
  for (const tx of transactions) {
    if (!tx.instrumentId) continue;
    if (tx.kind !== 'buy' && tx.kind !== 'sell') continue;
    if (!tx.quantity || !tx.price) continue;
    const key = `${tx.instrumentId}|${tx.kind}`;
    const existing = out.get(key);
    if (existing && existing.timestamp >= tx.timestamp) continue;
    out.set(key, {
      timestamp: tx.timestamp,
      broker: tx.broker,
      quantity: Math.abs(tx.quantity),
      price: tx.price,
      currency: tx.currency,
    });
  }
  return out;
}
