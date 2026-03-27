import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IWixShareIssued, IWixShareSold, ITransaction } from './types.js';
import { convertAmount } from './currency.js';

// ============================================================================
// Helpers
// ============================================================================

/** Parse WIX date "DD/MM/YYYY" (possibly non-zero-padded) → "YYYY-MM-DD" */
function parseWixDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** Dedupe key for issued records: normalized vestingDate + grantId + shares */
function issuedKey(r: IWixShareIssued): string {
  return `${parseWixDate(r.vestingDate)}|${r.grantId}|${r.shares}`;
}

// ============================================================================
// File-level parsers
// ============================================================================

/**
 * Parse shares-issued.txt — space-delimited, no header.
 * Columns: grantDate, grantId, type, vestingDate, shares, fmv, $, costBasis, $
 */
export function parseWixIssuedFile(filePath: string): IWixShareIssued[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const seen = new Set<string>();
  const results: IWixShareIssued[] = [];

  for (const line of lines) {
    const match = line.match(
      /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\S+)\s+(RSU|ESPP)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d+)\s+([\d.]+)\s+\$\s+([\d.]+)\s+\$$/
    );
    if (!match) {
      console.warn(`[Wix] Could not parse issued line: ${line}`);
      continue;
    }

    const record: IWixShareIssued = {
      grantDate: match[1],
      grantId: match[2],
      type: match[3] as 'RSU' | 'ESPP',
      vestingDate: match[4],
      shares: parseInt(match[5], 10),
      fmv: parseFloat(match[6]),
      costBasisPerShare: parseFloat(match[7]),
    };

    const key = issuedKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(record);
  }

  return results;
}

/**
 * Parse shares-sold.txt — space-delimited, no header.
 * Columns: txnId, saleType (2-4 words), grantId, grantDate, equityType, saleDate, shares, salePrice, $, costBasis, $, fees, $
 */
export function parseWixSoldFile(filePath: string): IWixShareSold[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const seen = new Set<string>();
  const results: IWixShareSold[] = [];

  for (const line of lines) {
    const match = line.match(
      /^(\d+)\s+(Sell of (?:Restricted )?Stock)\s+(\S+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(RSU|ESPP)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d+)\s+([\d.]+)\s+\$\s+([\d.]+)\s+\$\s+([\d.]+)\s+\$$/
    );
    if (!match) {
      console.warn(`[Wix] Could not parse sold line: ${line}`);
      continue;
    }

    const txnId = match[1];
    if (seen.has(txnId)) continue;
    seen.add(txnId);

    results.push({
      transactionId: txnId,
      saleType: match[2] as IWixShareSold['saleType'],
      grantId: match[3],
      grantDate: match[4],
      equityType: match[5] as 'RSU' | 'ESPP',
      saleDate: match[6],
      shares: parseInt(match[7], 10),
      salePricePerShare: parseFloat(match[8]),
      costBasisPerShare: parseFloat(match[9]),
      fees: parseFloat(match[10]),
    });
  }

  return results;
}

export interface WixParsedData {
  issued: IWixShareIssued[];
  sold: IWixShareSold[];
}

export async function parseAllWixFiles(dirPath: string): Promise<WixParsedData> {
  const issuedPath = join(dirPath, 'shares-issued.txt');
  const soldPath = join(dirPath, 'shares-sold.txt');

  const issued = existsSync(issuedPath) ? parseWixIssuedFile(issuedPath) : [];
  const sold = existsSync(soldPath) ? parseWixSoldFile(soldPath) : [];

  return { issued, sold };
}

// ============================================================================
// Classify into ITransaction[]
// ============================================================================

export function classifyWixTransactions(data: WixParsedData): ITransaction[] {
  const transactions: ITransaction[] = [];

  // Issued shares → RSU_VEST or ESPP_PURCHASE
  for (const rec of data.issued) {
    const date = parseWixDate(rec.vestingDate);
    const isRsu = rec.type === 'RSU';

    // For RSU: cost basis is $0, but FMV is the effective acquisition price for portfolio tracking
    // For ESPP: cost basis is the discounted price actually paid
    const pricePerUnit = isRsu ? rec.fmv : rec.costBasisPerShare;
    const amount = rec.shares * pricePerUnit;
    const amountInBaseCurrency = convertAmount(amount, date, 'USD', 'EUR');

    transactions.push({
      id: `wix-${rec.type.toLowerCase()}-${rec.grantId}-${date}`,
      broker: 'wix',
      type: isRsu ? 'RSU_VEST' : 'ESPP_PURCHASE',
      date,
      symbol: 'WIX',
      description: isRsu
        ? `RSU vest (grant ${rec.grantId}) — ${rec.shares} shares @ $${rec.fmv} FMV`
        : `ESPP purchase (plan ${rec.grantId}) — ${rec.shares} shares @ $${rec.costBasisPerShare} (FMV $${rec.fmv})`,
      quantity: rec.shares,
      pricePerUnit,
      amount,
      currency: 'USD',
      fees: 0,
      amountInBaseCurrency,
      raw: rec,
    });
  }

  // Sold shares → SELL
  for (const rec of data.sold) {
    const date = parseWixDate(rec.saleDate);
    const amount = rec.shares * rec.salePricePerShare;
    const amountInBaseCurrency = convertAmount(amount, date, 'USD', 'EUR');

    transactions.push({
      id: `wix-sell-${rec.transactionId}`,
      broker: 'wix',
      type: 'SELL',
      date,
      symbol: 'WIX',
      description: `${rec.saleType} (${rec.equityType} grant ${rec.grantId}) — ${rec.shares} shares @ $${rec.salePricePerShare}`,
      quantity: -rec.shares,
      pricePerUnit: rec.salePricePerShare,
      amount,
      currency: 'USD',
      fees: rec.fees,
      amountInBaseCurrency,
      raw: rec,
    });
  }

  return transactions;
}
