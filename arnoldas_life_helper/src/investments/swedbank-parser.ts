import Papa from 'papaparse';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ISwedBankTransaction, ITransaction, TransactionType } from './types.js';
import type { IDataParser } from './parser.js';

// Ticker aliases for renamed stocks
const TICKER_ALIASES: Record<string, string> = {
  'NOVC-GY': 'NOV-GY',
};

// Tickers traded in foreign currencies (Swedbank account is EUR but price is in trading currency)
const TICKER_TRADING_CURRENCY: Record<string, string> = {
  '002594': 'CNH',  // BYD on Shenzhen exchange, priced in CNY/CNH
};

// ISIN → ticker for dividend parsing
const ISIN_TO_TICKER: Record<string, string> = {
  'LT0000115768': 'IGN1L',
  'LT0000102337': 'APG1L',
  'DE0007100000': 'DCX',
  'EE3500110244': 'NHCBHFFT',
  'LT0000123911': 'TEL1L',
};

function normalizeTicker(ticker: string): string {
  return TICKER_ALIASES[ticker] || ticker;
}

// Regex patterns for Details column
const STOCK_TRADE_RE = /^([A-Z0-9-]+)\s+([+-])(\d+(?:\.\d+)?)@(\d*\.?\d+)\//;
const FUND_ORDER_RE = /^'?\d+\s+Fundorder\s+\d+\s*\+\s*(\S+)/;
const TAX_PREFIX_RE = /^K:\s*/;
const DIVIDEND_NEW_RE = /DIVIDENDAI\s*\/\s*(.+?)\s*\/\s*([A-Z0-9]+)\s*\/\s*([\d.]+)\s*EUR\/VNT/;
const DIVIDEND_OLD_RE = /DIVIDENDAI\s+U.\s+(?:VP\s+)?(?:ISIN\s+)?(?:(.+?)\s+ISIN\s+)?([A-Z0-9]+),\s*([\d.]+)\s*EUR\/VNT/;
const CUSTODY_FEE_RE = /^VP s..skaita/;
const TRANSFER_RE = /Pervedimas tarp savo|Transfer between own|Tarp savo|Kredito padengimas/i;

export class SwedBankParser implements IDataParser<ISwedBankTransaction> {
  async parse(filePath: string): Promise<ISwedBankTransaction[]> {
    const csv = readFileSync(filePath, 'utf-8');
    const result = Papa.parse(csv, { header: false, skipEmptyLines: true });
    const rows = result.data as string[][];

    const transactions: ISwedBankTransaction[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 10) continue;

      const rowType = (row[1] || '').trim();
      if (rowType !== '20') continue;

      transactions.push({
        accountNo: (row[0] || '').trim(),
        rowType,
        date: (row[2] || '').trim(),
        beneficiary: (row[3] || '').trim(),
        details: (row[4] || '').trim(),
        amount: parseFloat(row[5]) || 0,
        currency: (row[6] || '').trim(),
        debitCredit: (row[7] || '').trim() as 'D' | 'K',
        recordId: (row[8] || '').trim(),
        code: (row[9] || '').trim(),
        referenceNo: (row[10] || '').trim(),
        docNo: (row[11] || '').trim(),
      });
    }
    return transactions;
  }
}

export async function parseAllSwedbankFiles(dirPath: string): Promise<ISwedBankTransaction[]> {
  if (!existsSync(dirPath)) return [];

  const files = readdirSync(dirPath)
    .filter(f => f.endsWith('.csv'))
    .sort();

  const parser = new SwedBankParser();
  const all: ISwedBankTransaction[] = [];

  for (const file of files) {
    const txns = await parser.parse(join(dirPath, file));
    all.push(...txns);
  }

  return all;
}

export function classifySwedbankTransaction(raw: ISwedBankTransaction): ITransaction {
  const base = {
    id: raw.recordId,
    broker: 'swedbank' as const,
    date: raw.date,
    amount: raw.amount,
    currency: raw.currency,
    fees: 0,
    amountInBaseCurrency: raw.amount, // Already EUR
    raw,
  };

  // Trade tax (code TT, details starts with "K:")
  if (raw.code === 'TT' && TAX_PREFIX_RE.test(raw.details)) {
    const cleaned = raw.details.replace(TAX_PREFIX_RE, '');
    const match = cleaned.match(STOCK_TRADE_RE);
    const symbol = match ? normalizeTicker(match[1]) : '';
    return {
      ...base,
      id: raw.recordId + '-TT',
      type: 'TAX',
      symbol,
      description: raw.details,
      quantity: 0,
      pricePerUnit: 0,
    };
  }

  // Dividend (code MK, details contains DIVIDENDAI)
  if (raw.details.includes('DIVIDENDAI')) {
    let symbol = '';
    let description = raw.details;
    let perShareRate = 0;

    const newMatch = raw.details.match(DIVIDEND_NEW_RE);
    if (newMatch) {
      const isin = newMatch[2];
      symbol = ISIN_TO_TICKER[isin] || isin;
      perShareRate = parseFloat(newMatch[3]) || 0;
      description = `Dividend: ${newMatch[1].trim()} (${isin})`;
    } else {
      const oldMatch = raw.details.match(DIVIDEND_OLD_RE);
      if (oldMatch) {
        const isin = oldMatch[2];
        symbol = ISIN_TO_TICKER[isin] || isin;
        perShareRate = parseFloat(oldMatch[3]) || 0;
        description = `Dividend: ${oldMatch[1]?.trim() || isin} (${isin})`;
      }
    }

    return {
      ...base,
      type: 'DIVIDEND',
      symbol,
      description,
      quantity: 0,
      pricePerUnit: perShareRate,
    };
  }

  // Transfer (code MK + transfer keywords)
  if (raw.code === 'MK' && TRANSFER_RE.test(raw.details)) {
    return {
      ...base,
      type: 'TRANSFER',
      symbol: '',
      description: raw.details,
      quantity: 0,
      pricePerUnit: 0,
    };
  }

  // Custody fee (code M, details starts with "VP sąskaita")
  if (raw.code === 'M' && CUSTODY_FEE_RE.test(raw.details)) {
    return {
      ...base,
      type: 'FEE',
      symbol: '',
      description: raw.details,
      quantity: 0,
      pricePerUnit: 0,
    };
  }

  // Stock/fund trade (code M, details matches trade pattern)
  if (raw.code === 'M') {
    const tradeMatch = raw.details.match(STOCK_TRADE_RE);
    if (tradeMatch) {
      const ticker = normalizeTicker(tradeMatch[1]);
      const direction = tradeMatch[2]; // + or -
      const quantity = parseFloat(tradeMatch[3]);
      const price = parseFloat(tradeMatch[4]);
      const type: TransactionType = direction === '+' ? 'BUY' : 'SELL';

      const tradingCurrency = TICKER_TRADING_CURRENCY[ticker] || base.currency;
      return {
        ...base,
        type,
        symbol: ticker,
        description: raw.details,
        quantity: direction === '+' ? quantity : -quantity,
        pricePerUnit: price,
        currency: tradingCurrency,
      };
    }

    // Fund order (no quantity/price available)
    const fundMatch = raw.details.match(FUND_ORDER_RE);
    if (fundMatch) {
      return {
        ...base,
        type: 'BUY',
        symbol: fundMatch[1],
        description: raw.details,
        quantity: 0,
        pricePerUnit: 0,
      };
    }
  }

  // Fallback: treat as transfer
  return {
    ...base,
    type: 'TRANSFER',
    symbol: '',
    description: raw.details,
    quantity: 0,
    pricePerUnit: 0,
  };
}

export function classifySwedbankTransactions(raws: ISwedBankTransaction[]): ITransaction[] {
  return raws.map(classifySwedbankTransaction);
}
