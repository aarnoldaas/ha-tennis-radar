import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parseAllSwedbankFiles, classifySwedbankTransactions } from './swedbank-parser.js';
import { computeHoldings } from './holdings.js';
import type { ITransaction, IHolding } from './types.js';

export interface InvestmentData {
  transactions: ITransaction[];
  holdings: IHolding[];
}

let cached: InvestmentData | null = null;

export async function loadInvestmentData(dataDir: string): Promise<InvestmentData> {
  const swedbankDir = join(dataDir, 'Investments', 'swedbank');

  let transactions: ITransaction[] = [];

  if (existsSync(swedbankDir)) {
    const rawTransactions = await parseAllSwedbankFiles(swedbankDir);
    transactions = classifySwedbankTransactions(rawTransactions)
      .sort((a, b) => a.date.localeCompare(b.date));
    console.log(`[Investments] Parsed ${transactions.length} Swedbank transactions`);
  } else {
    console.log(`[Investments] No Swedbank data found at ${swedbankDir}`);
  }

  const holdings = computeHoldings(transactions);
  console.log(`[Investments] Computed ${holdings.length} holdings`);

  cached = { transactions, holdings };
  return cached;
}

export function getInvestmentData(): InvestmentData | null {
  return cached;
}
