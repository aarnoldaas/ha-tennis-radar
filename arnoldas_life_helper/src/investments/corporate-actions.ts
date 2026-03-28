// ============================================================================
// Corporate Actions — Stock Splits
// ============================================================================

import type { ILot } from './types.js';

interface StockSplit {
  ticker: string;
  date: string;
  ratio: number; // e.g. 20 means 1 share becomes 20
}

/**
 * Known stock splits affecting portfolio holdings.
 * Add new entries as needed.
 */
const STOCK_SPLITS: StockSplit[] = [
  { ticker: 'GOOG', date: '2022-07-15', ratio: 20 },
  { ticker: '002594', date: '2025-06-11', ratio: 3 },  // BYD 3:1 bonus issue
];

/**
 * Adjust a lot's quantity and cost basis for stock splits that occurred after acquisition.
 * Mutates the lot in place.
 */
export function adjustLotForSplits(lot: ILot): void {
  for (const split of STOCK_SPLITS) {
    if (lot.symbol !== split.ticker) continue;
    // Only apply if lot was acquired before the split
    if (lot.acquisitionDate < split.date) {
      lot.originalQuantity *= split.ratio;
      lot.remainingQuantity *= split.ratio;
      lot.costBasisPerShare /= split.ratio;
      lot.fmvAtAcquisition /= split.ratio;
    }
  }
}

/**
 * Get all known splits for a ticker.
 */
export function getSplitsForTicker(ticker: string): StockSplit[] {
  return STOCK_SPLITS.filter(s => s.ticker === ticker);
}
