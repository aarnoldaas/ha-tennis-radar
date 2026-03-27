import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parseAllSwedbankFiles, classifySwedbankTransactions } from './swedbank-parser.js';
import { parseAllRevolutFiles, classifyRevolutTransactions, type RevolutInterestSummary } from './revolut-parser.js';
import { parseAllIBFiles, classifyIBTransactions } from './ib-parser.js';
import { parseAllWixFiles, classifyWixTransactions } from './wix-parser.js';
import { computeHoldings } from './holdings.js';
import type { ITransaction, IHolding } from './types.js';

export interface InvestmentData {
  transactions: ITransaction[];
  holdings: IHolding[];
  interestSummary: RevolutInterestSummary | null;
}

let cached: InvestmentData | null = null;

export async function loadInvestmentData(dataDir: string): Promise<InvestmentData> {
  const swedbankDir = join(dataDir, 'Investments', 'swedbank');
  const revolutDir = join(dataDir, 'Investments', 'revolut');

  let transactions: ITransaction[] = [];
  let interestSummary: RevolutInterestSummary | null = null;

  // Swedbank
  if (existsSync(swedbankDir)) {
    const rawTransactions = await parseAllSwedbankFiles(swedbankDir);
    const swedbankTxns = classifySwedbankTransactions(rawTransactions);
    transactions.push(...swedbankTxns);
    console.log(`[Investments] Parsed ${swedbankTxns.length} Swedbank transactions`);
  } else {
    console.log(`[Investments] No Swedbank data found at ${swedbankDir}`);
  }

  // Interactive Brokers
  const ibDir = join(dataDir, 'Investments', 'interactive-brokers');
  if (existsSync(ibDir)) {
    const rawIB = await parseAllIBFiles(ibDir);
    const ibTxns = classifyIBTransactions(rawIB);
    transactions.push(...ibTxns);
    console.log(`[Investments] Parsed ${ibTxns.length} IB transactions (from ${rawIB.length} raw rows, ${rawIB.length - ibTxns.length} forex skipped)`);
  } else {
    console.log(`[Investments] No IB data found at ${ibDir}`);
  }

  // Wix
  const wixDir = join(dataDir, 'Investments', 'wix');
  if (existsSync(wixDir)) {
    const wixData = await parseAllWixFiles(wixDir);
    const wixTxns = classifyWixTransactions(wixData);
    transactions.push(...wixTxns);
    console.log(`[Investments] Parsed ${wixTxns.length} Wix transactions (issued: ${wixData.issued.length}, sold: ${wixData.sold.length})`);
  } else {
    console.log(`[Investments] No Wix data found at ${wixDir}`);
  }

  // Revolut
  if (existsSync(revolutDir)) {
    const revolutData = await parseAllRevolutFiles(revolutDir);
    const revolutTxns = classifyRevolutTransactions(revolutData);
    transactions.push(...revolutTxns);
    interestSummary = revolutData.interestSummary;
    console.log(`[Investments] Parsed ${revolutTxns.length} Revolut transactions (brokerage: ${revolutData.brokerageEur.length + revolutData.brokerageUsd.length}, crypto: ${revolutData.crypto.length})`);
    console.log(`[Investments] Revolut interest: €${revolutData.interestSummary.totalEur}`);
  } else {
    console.log(`[Investments] No Revolut data found at ${revolutDir}`);
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  const holdings = computeHoldings(transactions);
  console.log(`[Investments] Computed ${holdings.length} holdings`);

  cached = { transactions, holdings, interestSummary };
  return cached;
}

export function getInvestmentData(): InvestmentData | null {
  return cached;
}
