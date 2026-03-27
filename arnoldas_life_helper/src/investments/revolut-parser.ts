import Papa from 'papaparse';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IRevolutBrokerageSell, IRevolutCryptoSell, ITransaction } from './types.js';
import { convertAmount } from './currency.js';

// ============================================================================
// Interest Summary (extracted from file header summaries)
// ============================================================================

export interface RevolutInterestSummary {
  flexibleCashEur: number;
  flexibleCashUsd: number;
  savingsEur: number;
  savingsUsd: number;
  /** All interest converted to EUR */
  totalEur: number;
}

// ============================================================================
// Full parsed result
// ============================================================================

export interface RevolutParsedData {
  brokerageEur: IRevolutBrokerageSell[];
  brokerageUsd: IRevolutBrokerageSell[];
  crypto: IRevolutCryptoSell[];
  interestSummary: RevolutInterestSummary;
}

// ============================================================================
// Helpers
// ============================================================================

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/** Parse "Mon DD, YYYY" → "YYYY-MM-DD" */
function parseRevolutDate(dateStr: string): string {
  const cleaned = dateStr.replace(/^"|"$/g, '').trim();
  const match = cleaned.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) return '';
  const [, mon, day, year] = match;
  return `${year}-${MONTH_MAP[mon] || '01'}-${day.padStart(2, '0')}`;
}

/** Strip currency symbols (€, $, US$) and commas, return number */
function parseMoney(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/^"|"$/g, '')
    .replace(/US\$/g, '')
    .replace(/[€$,]/g, '')
    .trim();
  return parseFloat(cleaned) || 0;
}

/** Find the first line index starting with the given marker */
function findSection(lines: string[], marker: string): number {
  return lines.findIndex(l => l.trim().startsWith(marker));
}

// ============================================================================
// Summary section parsing (interest totals)
// ============================================================================

function parseInterestFromSummary(lines: string[], sectionMarker: string): number {
  const idx = findSection(lines, sectionMarker);
  if (idx < 0) return 0;

  for (let i = idx + 1; i < Math.min(idx + 15, lines.length); i++) {
    if (lines[i].startsWith('Total earned interest')) {
      const parts = lines[i].split(',');
      return parts.length >= 2 ? parseMoney(parts[1]) : 0;
    }
  }
  return 0;
}

// ============================================================================
// Brokerage section parsing
// ============================================================================

function parseBrokerageSection(
  lines: string[],
  sectionMarker: string,
  currency: string,
): IRevolutBrokerageSell[] {
  const idx = findSection(lines, sectionMarker);
  if (idx < 0) return [];

  // Find the header row (contains "Date acquired")
  let headerIdx = -1;
  for (let i = idx + 1; i < Math.min(idx + 5, lines.length); i++) {
    if (lines[i].includes('Date acquired')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return [];

  // Collect data rows until blank line or next section
  const dataLines: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('Transactions for ') || line.startsWith('Summary for ')) break;
    dataLines.push(lines[i]);
  }
  if (dataLines.length === 0) return [];

  const csv = [lines[headerIdx], ...dataLines].join('\n');
  const result = Papa.parse(csv, { header: true, skipEmptyLines: true });

  return (result.data as Record<string, string>[]).map(row => ({
    dateAcquired: row['Date acquired'] || '',
    dateSold: row['Date sold'] || '',
    securityName: row['Security name'] || '',
    symbol: row['Symbol'] || '',
    isin: row['ISIN'] || '',
    country: row['Country'] || '',
    quantity: parseFloat(row['Qty']) || 0,
    costBasis: parseMoney(row['Cost basis']),
    costBasisBaseCurrency: parseMoney(row['Cost basis base currency']),
    costBasisRate: parseFloat(row['Cost basis rate']) || 0,
    grossProceeds: parseMoney(row['Gross proceeds']),
    grossProceedsBaseCurrency: parseMoney(row['Gross proceeds base currency']),
    grossProceedsRate: parseFloat(row['Gross proceeds rate']) || 0,
    grossPnl: parseMoney(row['Gross PnL']),
    grossPnlBaseCurrency: parseMoney(row['Gross PnL base currency']),
    fees: parseMoney(row['Fees']),
    feesBaseCurrency: parseMoney(row['Fees  base currency']),
    currency,
  }));
}

// ============================================================================
// Crypto section parsing
// ============================================================================

function parseCryptoSection(lines: string[]): IRevolutCryptoSell[] {
  const idx = findSection(lines, 'Transactions for Crypto');
  if (idx < 0) return [];

  let headerIdx = -1;
  for (let i = idx + 1; i < Math.min(idx + 3, lines.length); i++) {
    if (lines[i].includes('Date acquired')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return [];

  const dataLines: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') break;
    dataLines.push(lines[i]);
  }
  if (dataLines.length === 0) return [];

  const csv = [lines[headerIdx], ...dataLines].join('\n');
  const result = Papa.parse(csv, { header: true, skipEmptyLines: true });

  return (result.data as Record<string, string>[]).map(row => ({
    dateAcquired: row['Date acquired'] || '',
    dateSold: row['Date sold'] || '',
    tokenName: row['Token name'] || '',
    quantity: parseFloat(row['Qty']) || 0,
    costBasis: parseMoney(row['Cost basis']),
    grossProceeds: parseMoney(row['Gross proceeds']),
    grossPnl: parseMoney(row['Gross PnL']),
  }));
}

// ============================================================================
// File-level parser
// ============================================================================

export async function parseRevolutFile(filePath: string): Promise<RevolutParsedData> {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Interest summaries from header sections
  const flexibleCashEur = parseInterestFromSummary(lines, 'Summary for Flexible Cash Funds - EUR');
  const flexibleCashUsd = parseInterestFromSummary(lines, 'Summary for Flexible Cash Funds - USD');
  const savingsEur = parseInterestFromSummary(lines, 'Summary for Savings Accounts - EUR');
  const savingsUsd = parseInterestFromSummary(lines, 'Summary for Savings Accounts - USD');

  const usdInEur = convertAmount(flexibleCashUsd + savingsUsd, '2025-06-01', 'USD', 'EUR');
  const totalEur = Math.round((flexibleCashEur + savingsEur + usdInEur) * 100) / 100;

  return {
    brokerageEur: parseBrokerageSection(lines, 'Transactions for Brokerage Account sells - EUR', 'EUR'),
    brokerageUsd: parseBrokerageSection(lines, 'Transactions for Brokerage Account sells - USD', 'USD'),
    crypto: parseCryptoSection(lines),
    interestSummary: { flexibleCashEur, flexibleCashUsd, savingsEur, savingsUsd, totalEur },
  };
}

const EMPTY_SUMMARY: RevolutInterestSummary = {
  flexibleCashEur: 0, flexibleCashUsd: 0, savingsEur: 0, savingsUsd: 0, totalEur: 0,
};

export async function parseAllRevolutFiles(dirPath: string): Promise<RevolutParsedData> {
  if (!existsSync(dirPath)) {
    return { brokerageEur: [], brokerageUsd: [], crypto: [], interestSummary: { ...EMPTY_SUMMARY } };
  }

  const files = readdirSync(dirPath).filter(f => f.endsWith('.csv')).sort();
  const combined: RevolutParsedData = {
    brokerageEur: [], brokerageUsd: [], crypto: [],
    interestSummary: { ...EMPTY_SUMMARY },
  };

  for (const file of files) {
    const data = await parseRevolutFile(join(dirPath, file));
    combined.brokerageEur.push(...data.brokerageEur);
    combined.brokerageUsd.push(...data.brokerageUsd);
    combined.crypto.push(...data.crypto);
    combined.interestSummary.flexibleCashEur += data.interestSummary.flexibleCashEur;
    combined.interestSummary.flexibleCashUsd += data.interestSummary.flexibleCashUsd;
    combined.interestSummary.savingsEur += data.interestSummary.savingsEur;
    combined.interestSummary.savingsUsd += data.interestSummary.savingsUsd;
    combined.interestSummary.totalEur += data.interestSummary.totalEur;
  }

  return combined;
}

// ============================================================================
// Classify into ITransaction[] (synthetic BUY + actual SELL/CRYPTO_SELL)
// ============================================================================

export function classifyRevolutTransactions(data: RevolutParsedData): ITransaction[] {
  const transactions: ITransaction[] = [];
  let counter = 0;

  // Brokerage sells → synthetic BUY + SELL pairs
  for (const sell of [...data.brokerageEur, ...data.brokerageUsd]) {
    counter++;
    const buyDate = parseRevolutDate(sell.dateAcquired);
    const sellDate = parseRevolutDate(sell.dateSold);
    const costPerUnit = sell.quantity > 0 ? sell.costBasis / sell.quantity : 0;
    const sellPricePerUnit = sell.quantity > 0 ? sell.grossProceeds / sell.quantity : 0;

    transactions.push({
      id: `rev-brok-buy-${counter}`,
      broker: 'revolut',
      type: 'BUY',
      date: buyDate,
      symbol: sell.symbol,
      description: `Buy ${sell.securityName}`,
      quantity: sell.quantity,
      pricePerUnit: costPerUnit,
      amount: Math.abs(sell.costBasis),
      currency: sell.currency,
      fees: 0,
      amountInBaseCurrency: Math.abs(sell.costBasisBaseCurrency),
    });

    transactions.push({
      id: `rev-brok-sell-${counter}`,
      broker: 'revolut',
      type: 'SELL',
      date: sellDate,
      symbol: sell.symbol,
      description: `Sell ${sell.securityName}`,
      quantity: -sell.quantity,
      pricePerUnit: sellPricePerUnit,
      amount: Math.abs(sell.grossProceeds),
      currency: sell.currency,
      fees: Math.abs(sell.fees),
      amountInBaseCurrency: Math.abs(sell.grossProceedsBaseCurrency),
    });
  }

  // Crypto sells → synthetic BUY + CRYPTO_SELL pairs
  for (const sell of data.crypto) {
    counter++;
    const buyDate = parseRevolutDate(sell.dateAcquired);
    const sellDate = parseRevolutDate(sell.dateSold);
    const costPerUnit = sell.quantity > 0 ? sell.costBasis / sell.quantity : 0;
    const sellPricePerUnit = sell.quantity > 0 ? sell.grossProceeds / sell.quantity : 0;

    transactions.push({
      id: `rev-crypto-buy-${counter}`,
      broker: 'revolut',
      type: 'BUY',
      date: buyDate,
      symbol: sell.tokenName,
      description: `Buy ${sell.tokenName}`,
      quantity: sell.quantity,
      pricePerUnit: costPerUnit,
      amount: Math.abs(sell.costBasis),
      currency: 'USD',
      fees: 0,
      amountInBaseCurrency: convertAmount(Math.abs(sell.costBasis), buyDate, 'USD', 'EUR'),
    });

    transactions.push({
      id: `rev-crypto-sell-${counter}`,
      broker: 'revolut',
      type: 'CRYPTO_SELL',
      date: sellDate,
      symbol: sell.tokenName,
      description: `Sell ${sell.tokenName}`,
      quantity: -sell.quantity,
      pricePerUnit: sellPricePerUnit,
      amount: Math.abs(sell.grossProceeds),
      currency: 'USD',
      fees: 0,
      amountInBaseCurrency: convertAmount(Math.abs(sell.grossProceeds), sellDate, 'USD', 'EUR'),
    });
  }

  return transactions;
}
