// ============================================================================
// Equity Compensation — RSU & ESPP Analytics
// ============================================================================

import type { ITransaction, IRsuVesting, IRsuCompensationSummary } from './types.js';
import { convertAmount } from './currency.js';

/**
 * Compute RSU compensation summary from transactions.
 */
export function computeRsuCompensation(transactions: ITransaction[]): IRsuCompensationSummary {
  const vestings: IRsuVesting[] = [];
  const byGrantMap = new Map<string, { grantId: string; totalShares: number; totalCompensation: number; vestings: IRsuVesting[] }>();
  const byYearMap = new Map<number, { year: number; totalShares: number; totalCompensation: number; totalCompensationEur: number }>();

  // Find RSU vesting and same-day sale transactions
  const rsuVests = transactions.filter(t => t.type === 'RSU_VEST');
  const sells = transactions.filter(t => t.type === 'SELL' && t.broker === 'wix');

  for (const txn of rsuVests) {
    const compensationValue = txn.quantity * txn.pricePerUnit;
    const compensationValueEur = convertAmount(compensationValue, txn.date, txn.currency, 'EUR');

    // Check for same-day sale
    const sameDaySale = sells.some(s =>
      s.date === txn.date &&
      s.symbol === txn.symbol &&
      Math.abs(s.quantity) === txn.quantity
    );

    const grantId = (txn.raw as any)?.grantId ?? 'unknown';

    const vesting: IRsuVesting = {
      grantId,
      vestingDate: txn.date,
      shares: txn.quantity,
      fmvAtVesting: txn.pricePerUnit,
      compensationValue,
      compensationValueEur: Math.round(compensationValueEur * 100) / 100,
      isSameDaySale: sameDaySale,
    };
    vestings.push(vesting);

    // By grant
    if (!byGrantMap.has(grantId)) {
      byGrantMap.set(grantId, { grantId, totalShares: 0, totalCompensation: 0, vestings: [] });
    }
    const grant = byGrantMap.get(grantId)!;
    grant.totalShares += txn.quantity;
    grant.totalCompensation += compensationValue;
    grant.vestings.push(vesting);

    // By year
    const year = parseInt(txn.date.slice(0, 4));
    if (!byYearMap.has(year)) {
      byYearMap.set(year, { year, totalShares: 0, totalCompensation: 0, totalCompensationEur: 0 });
    }
    const yearEntry = byYearMap.get(year)!;
    yearEntry.totalShares += txn.quantity;
    yearEntry.totalCompensation += compensationValue;
    yearEntry.totalCompensationEur += compensationValueEur;
  }

  const totalCompensation = vestings.reduce((s, v) => s + v.compensationValue, 0);
  const totalCompensationEur = vestings.reduce((s, v) => s + v.compensationValueEur, 0);

  // Build cumulative timeline
  const sortedVestings = [...vestings].sort((a, b) => a.vestingDate.localeCompare(b.vestingDate));
  let cumComp = 0;
  let cumCompEur = 0;
  const cumulative = sortedVestings.map(v => {
    cumComp += v.compensationValue;
    cumCompEur += v.compensationValueEur;
    return {
      date: v.vestingDate,
      cumulativeCompensation: Math.round(cumComp * 100) / 100,
      cumulativeCompensationEur: Math.round(cumCompEur * 100) / 100,
    };
  });

  // Round year totals
  for (const y of byYearMap.values()) {
    y.totalCompensationEur = Math.round(y.totalCompensationEur * 100) / 100;
  }

  return {
    totalCompensation: Math.round(totalCompensation * 100) / 100,
    totalCompensationEur: Math.round(totalCompensationEur * 100) / 100,
    byGrant: [...byGrantMap.values()].sort((a, b) => a.grantId.localeCompare(b.grantId)),
    byYear: [...byYearMap.values()].sort((a, b) => a.year - b.year),
    cumulative,
  };
}

/**
 * Simple ESPP statistics — how many shares purchased via ESPP, at what discount.
 */
export interface EsppSummary {
  totalSharesPurchased: number;
  totalCostBasis: number;
  totalFmvAtPurchase: number;
  totalDiscountCaptured: number;
  totalDiscountCapturedEur: number;
  averageDiscountPercent: number;
}

export function computeEsppSummary(transactions: ITransaction[]): EsppSummary {
  const esppBuys = transactions.filter(t => t.type === 'ESPP_PURCHASE');
  let totalShares = 0;
  let totalCost = 0;
  let totalFmv = 0;
  let totalDiscountEur = 0;

  for (const txn of esppBuys) {
    const fmvPerShare = (txn.raw as any)?.fmv ?? txn.pricePerUnit;
    const costPerShare = txn.pricePerUnit;
    const discount = (fmvPerShare - costPerShare) * txn.quantity;

    totalShares += txn.quantity;
    totalCost += costPerShare * txn.quantity;
    totalFmv += fmvPerShare * txn.quantity;
    totalDiscountEur += convertAmount(discount, txn.date, txn.currency, 'EUR');
  }

  const totalDiscount = totalFmv - totalCost;
  const avgPct = totalFmv > 0 ? (totalDiscount / totalFmv) * 100 : 0;

  return {
    totalSharesPurchased: totalShares,
    totalCostBasis: Math.round(totalCost * 100) / 100,
    totalFmvAtPurchase: Math.round(totalFmv * 100) / 100,
    totalDiscountCaptured: Math.round(totalDiscount * 100) / 100,
    totalDiscountCapturedEur: Math.round(totalDiscountEur * 100) / 100,
    averageDiscountPercent: Math.round(avgPct * 100) / 100,
  };
}
