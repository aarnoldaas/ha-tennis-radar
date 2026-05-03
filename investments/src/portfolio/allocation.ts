import type {
  Allocation,
  AllocationSlice,
  BrokerKey,
  CashBalance,
  MergedHolding,
} from '../parsers/types.js';
import { BROKER_LABELS } from '../parsers/types.js';

/**
 * Compute three allocation donuts from the current portfolio:
 *
 *   - byAssetClass: equity / etf / bond / cash / crypto
 *   - byCurrency:   EUR / USD / GBP / ...
 *   - byBroker:     Swedbank / IB / Wix / Revolut
 *
 * Each slice is the share of total portfolio value (holdings market value +
 * cash). Holdings without a market price contribute their cost basis so the
 * denominator is never zero for active positions.
 */
export function buildAllocation(holdings: MergedHolding[], cash: CashBalance[]): Allocation {
  const classMap = new Map<string, number>();
  const ccyMap = new Map<string, number>();
  const brokerMap = new Map<BrokerKey, number>();

  for (const h of holdings) {
    const mv = h.marketValueBase ?? h.costBasisBase;
    classMap.set(h.assetClass, (classMap.get(h.assetClass) ?? 0) + mv);
    ccyMap.set(h.currency, (ccyMap.get(h.currency) ?? 0) + mv);
    for (const b of h.perBroker) {
      const portion = h.quantity > 0 ? (b.quantity / h.quantity) * mv : 0;
      brokerMap.set(b.broker, (brokerMap.get(b.broker) ?? 0) + portion);
    }
  }

  let totalCash = 0;
  for (const c of cash) {
    const v = c.amountBase;
    if (v <= 0) continue;
    totalCash += v;
    ccyMap.set(c.currency, (ccyMap.get(c.currency) ?? 0) + v);
    brokerMap.set(c.broker, (brokerMap.get(c.broker) ?? 0) + v);
  }
  if (totalCash > 0) {
    classMap.set('cash', (classMap.get('cash') ?? 0) + totalCash);
  }

  return {
    byAssetClass: toSlices(classMap, identity),
    byCurrency: toSlices(ccyMap, identity),
    byBroker: toSlices(brokerMap, key => BROKER_LABELS[key as BrokerKey] ?? String(key)),
  };
}

function identity<T>(v: T): string {
  return String(v);
}

function toSlices<K>(map: Map<K, number>, label: (k: K) => string): AllocationSlice[] {
  const total = [...map.values()].reduce((s, v) => s + Math.max(0, v), 0);
  const slices: AllocationSlice[] = [];
  for (const [k, v] of map) {
    if (v <= 0) continue;
    slices.push({
      key: String(k),
      label: label(k),
      valueBase: v,
      pct: total > 0 ? v / total : 0,
    });
  }
  return slices.sort((a, b) => b.valueBase - a.valueBase);
}
