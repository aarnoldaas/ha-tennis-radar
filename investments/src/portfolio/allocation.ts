import type {
  Allocation,
  AllocationSlice,
  MergedHolding,
} from '../parsers/types.js';

/**
 * Compute two allocation donuts from the current holdings:
 *
 *   - byAssetClass: equity / etf / bond / crypto
 *   - byCurrency:   native instrument currency
 *
 * Each slice is the share of total holdings value. Cash is intentionally
 * not tracked, so allocation reflects only investment positions. Broker is
 * a low-cardinality dimension (only Swedbank + IB), so we surface it on the
 * instrument-detail lots view rather than as a degenerate two-slice donut.
 */
export function buildAllocation(holdings: MergedHolding[]): Allocation {
  const classMap = new Map<string, number>();
  const ccyMap = new Map<string, number>();

  for (const h of holdings) {
    const mv = h.marketValueBase ?? h.costBasisBase;
    if (mv <= 0) continue;
    classMap.set(h.assetClass, (classMap.get(h.assetClass) ?? 0) + mv);
    ccyMap.set(h.currency, (ccyMap.get(h.currency) ?? 0) + mv);
  }

  return {
    byAssetClass: toSlices(classMap),
    byCurrency: toSlices(ccyMap),
  };
}

function toSlices(map: Map<string, number>): AllocationSlice[] {
  const total = [...map.values()].reduce((s, v) => s + Math.max(0, v), 0);
  const slices: AllocationSlice[] = [];
  for (const [k, v] of map) {
    if (v <= 0) continue;
    slices.push({
      key: k,
      label: k,
      valueBase: v,
      pct: total > 0 ? v / total : 0,
    });
  }
  return slices.sort((a, b) => b.valueBase - a.valueBase);
}
