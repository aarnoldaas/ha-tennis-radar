import Papa from 'papaparse';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  IBParsedStatement, IBTrade, IBDividend, IBWithholdingTax,
  IBDeposit, IBInterest, IBFee, IBInstrumentInfo, ITransaction,
} from './types.js';
import { convertAmount } from './currency.js';

// ============================================================================
// Low-level CSV helpers
// ============================================================================

/** Parse a single CSV line into an array of strings (handles quoting). */
function parseCSVLine(line: string): string[] {
  const result = Papa.parse(line, { header: false });
  return (result.data as string[][])[0] ?? [];
}

/** Strip thousands-separator commas and parse as float. */
function num(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace(/,/g, '')) || 0;
}

/** Extract just the date portion from "YYYY-MM-DD, HH:MM:SS" or "YYYY-MM-DD". */
function extractDate(dateTime: string): string {
  if (!dateTime) return '';
  return dateTime.split(',')[0].trim();
}

// ============================================================================
// Section grouper
// ============================================================================

interface RawSection {
  name: string;
  headers: string[][];
  dataRows: string[][];
}

/**
 * Group all lines of an IB Activity Statement CSV into sections.
 * Each line's first field is the section name, second field is the row type.
 */
function groupSections(content: string): Map<string, RawSection> {
  const sections = new Map<string, RawSection>();
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const fields = parseCSVLine(trimmed);
    if (fields.length < 3) continue;

    const sectionName = fields[0];
    const rowType = fields[1];

    if (!sections.has(sectionName)) {
      sections.set(sectionName, { name: sectionName, headers: [], dataRows: [] });
    }
    const section = sections.get(sectionName)!;

    if (rowType === 'Header') {
      section.headers.push(fields);
    } else if (rowType === 'Data') {
      section.dataRows.push(fields);
    }
    // Skip SubTotal, Total, Notes
  }

  return sections;
}

// ============================================================================
// Section-specific parsers
// ============================================================================

function parseAccountInfo(sections: Map<string, RawSection>): { accountId: string; baseCurrency: string; period: string } {
  let accountId = '';
  let baseCurrency = 'EUR';
  let period = '';

  const acctSection = sections.get('Account Information');
  if (acctSection) {
    for (const row of acctSection.dataRows) {
      const fieldName = row[2];
      const fieldValue = row[3];
      if (fieldName === 'Account') accountId = fieldValue ?? '';
      if (fieldName === 'Base Currency') baseCurrency = fieldValue ?? 'EUR';
    }
  }

  const stmtSection = sections.get('Statement');
  if (stmtSection) {
    for (const row of stmtSection.dataRows) {
      if (row[2] === 'Period') period = row[3] ?? '';
    }
  }

  return { accountId, baseCurrency, period };
}

function parseTrades(sections: Map<string, RawSection>): IBTrade[] {
  const section = sections.get('Trades');
  if (!section) return [];

  const trades: IBTrade[] = [];
  let inForexSection = false;

  // Track header transitions — when we see a second Header row, we've entered the Forex section
  // But headers are stored separately, so we need to detect Forex from the data rows themselves.
  // Approach: check the row-level Asset Category field.

  // The first header defines stock trade columns:
  // [0]=Trades, [1]=Header, [2]=DataDiscriminator, [3]=Asset Category, [4]=Currency,
  // [5]=Symbol, [6]=Date/Time, [7]=Quantity, [8]=T. Price, [9]=C. Price,
  // [10]=Proceeds, [11]=Comm/Fee, [12]=Basis, [13]=Realized P/L, [14]=MTM P/L, [15]=Code

  // Headers appear inline in the data stream. We detect Forex by checking if the
  // header count changes or by checking Asset Category in data rows.

  // Since headers and data are separated in our grouper, we need another approach:
  // The forex header has different columns (no C. Price, no Basis, etc.)
  // But more reliably, forex data rows have Asset Category = "Forex"

  for (const row of section.dataRows) {
    const dataDiscriminator = row[2];
    const assetCategory = row[3];

    // Only process stock trade orders
    if (assetCategory === 'Forex' || assetCategory === undefined) continue;
    if (dataDiscriminator !== 'Order') continue;

    trades.push({
      currency: row[4] ?? '',
      symbol: row[5] ?? '',
      dateTime: row[6] ?? '',
      quantity: num(row[7]),
      tradePrice: num(row[8]),
      closePrice: num(row[9]),
      proceeds: num(row[10]),
      commFee: num(row[11]),
      basis: num(row[12]),
      realizedPnl: num(row[13]),
      mtmPnl: num(row[14]),
      code: row[15] ?? '',
    });
  }

  return trades;
}

function parseDividends(sections: Map<string, RawSection>): IBDividend[] {
  const section = sections.get('Dividends');
  if (!section) return [];

  // Columns: [0]=Dividends, [1]=Data, [2]=Currency, [3]=Date, [4]=Description, [5]=Amount
  const dividends: IBDividend[] = [];

  for (const row of section.dataRows) {
    const currency = row[2] ?? '';
    // Skip total/summary rows
    if (currency.startsWith('Total') || currency === '') continue;

    const description = row[4] ?? '';
    if (description.startsWith('Total')) continue;

    dividends.push({
      currency,
      date: row[3] ?? '',
      description,
      amount: num(row[5]),
    });
  }

  return dividends;
}

function parseWithholdingTax(sections: Map<string, RawSection>): IBWithholdingTax[] {
  const section = sections.get('Withholding Tax');
  if (!section) return [];

  // Columns: [0]=Withholding Tax, [1]=Data, [2]=Currency, [3]=Date, [4]=Description, [5]=Amount, [6]=Code
  const taxes: IBWithholdingTax[] = [];

  for (const row of section.dataRows) {
    const currency = row[2] ?? '';
    if (currency.startsWith('Total') || currency === '') continue;

    const description = row[4] ?? '';
    if (description.startsWith('Total')) continue;

    taxes.push({
      currency,
      date: row[3] ?? '',
      description,
      amount: num(row[5]),
      code: row[6] ?? '',
    });
  }

  return taxes;
}

function parseDeposits(sections: Map<string, RawSection>): IBDeposit[] {
  const section = sections.get('Deposits & Withdrawals');
  if (!section) return [];

  // Columns: [0]=Deposits & Withdrawals, [1]=Data, [2]=Currency, [3]=Settle Date, [4]=Description, [5]=Amount
  const deposits: IBDeposit[] = [];

  for (const row of section.dataRows) {
    const currency = row[2] ?? '';
    if (currency.startsWith('Total') || currency === '') continue;

    deposits.push({
      currency,
      settleDate: row[3] ?? '',
      description: row[4] ?? '',
      amount: num(row[5]),
    });
  }

  return deposits;
}

function parseInterest(sections: Map<string, RawSection>): IBInterest[] {
  const section = sections.get('Interest');
  if (!section) return [];

  // Columns: [0]=Interest, [1]=Data, [2]=Currency, [3]=Date, [4]=Description, [5]=Amount
  const interest: IBInterest[] = [];

  for (const row of section.dataRows) {
    const currency = row[2] ?? '';
    if (currency.startsWith('Total') || currency === '') continue;

    interest.push({
      currency,
      date: row[3] ?? '',
      description: row[4] ?? '',
      amount: num(row[5]),
    });
  }

  return interest;
}

function parseFees(sections: Map<string, RawSection>): IBFee[] {
  const section = sections.get('Fees');
  if (!section) return [];

  // Columns: [0]=Fees, [1]=Data, [2]=Subtitle, [3]=Currency, [4]=Date, [5]=Description, [6]=Amount
  const fees: IBFee[] = [];

  for (const row of section.dataRows) {
    const subtitle = row[2] ?? '';
    if (subtitle.startsWith('Total') || subtitle === '') continue;

    const currency = row[3] ?? '';
    if (currency === '') continue;

    fees.push({
      currency,
      date: row[4] ?? '',
      description: row[5] ?? '',
      amount: num(row[6]),
    });
  }

  return fees;
}

function parseInstruments(sections: Map<string, RawSection>): Map<string, IBInstrumentInfo> {
  const section = sections.get('Financial Instrument Information');
  if (!section) return new Map();

  // Columns: [0]=Financial Instrument Information, [1]=Data, [2]=Asset Category,
  // [3]=Symbol, [4]=Description, [5]=Conid, [6]=Security ID, [7]=Underlying,
  // [8]=Listing Exch, [9]=Multiplier, [10]=Type, [11]=Code
  const instruments = new Map<string, IBInstrumentInfo>();

  for (const row of section.dataRows) {
    const rawSymbol = row[3] ?? '';
    // Handle multi-symbol entries like "89988, 89988.OLD" — use the first
    const symbol = rawSymbol.split(',')[0].trim();
    if (!symbol) continue;

    instruments.set(symbol, {
      symbol,
      description: row[4] ?? '',
      securityId: row[6] ?? '',
      listingExchange: row[8] ?? '',
      type: row[10] ?? '',
    });
  }

  return instruments;
}

// ============================================================================
// File-level parser
// ============================================================================

export async function parseIBFile(filePath: string): Promise<IBParsedStatement> {
  const content = readFileSync(filePath, 'utf-8');
  const sections = groupSections(content);
  const { accountId, baseCurrency, period } = parseAccountInfo(sections);

  return {
    accountId,
    baseCurrency,
    period,
    trades: parseTrades(sections),
    dividends: parseDividends(sections),
    withholdingTax: parseWithholdingTax(sections),
    deposits: parseDeposits(sections),
    interest: parseInterest(sections),
    fees: parseFees(sections),
    instruments: parseInstruments(sections),
  };
}

export async function parseAllIBFiles(dirPath: string): Promise<IBParsedStatement[]> {
  if (!existsSync(dirPath)) return [];

  const files = readdirSync(dirPath).filter(f => f.endsWith('.csv')).sort();
  const statements: IBParsedStatement[] = [];

  for (const file of files) {
    const stmt = await parseIBFile(join(dirPath, file));
    statements.push(stmt);
  }

  return statements;
}

// ============================================================================
// Helpers for classification
// ============================================================================

/** Extract ticker symbol from IB dividend/tax description like "ASML(NL0010273215) Cash Dividend..." */
function parseSymbolFromDescription(desc: string): string {
  const match = desc.match(/^([\w.]+)\(/);
  return match ? match[1] : '';
}

// ============================================================================
// Classify into ITransaction[]
// ============================================================================

export function classifyIBTransactions(statements: IBParsedStatement[]): ITransaction[] {
  const transactions: ITransaction[] = [];

  for (const stmt of statements) {
    const instrumentMap = stmt.instruments;

    // --- Trades → BUY / SELL ---
    const tradeCounters = new Map<string, number>();
    for (const trade of stmt.trades) {
      const date = extractDate(trade.dateTime);
      const isBuy = trade.quantity > 0;
      const fees = Math.abs(trade.commFee);
      const amount = Math.abs(trade.proceeds);
      const currency = trade.currency;

      // Generate deterministic ID
      const key = `${trade.symbol}-${date}`;
      const count = (tradeCounters.get(key) ?? 0) + 1;
      tradeCounters.set(key, count);
      const id = `ib-trade-${trade.symbol}-${date}-${count}`;

      // Convert to EUR base currency
      let amountInBaseCurrency: number;
      if (currency === 'EUR') {
        amountInBaseCurrency = amount;
      } else {
        amountInBaseCurrency = convertAmount(amount, date, currency, 'EUR');
      }

      const info = instrumentMap.get(trade.symbol);
      const desc = info?.description ?? trade.symbol;

      transactions.push({
        id,
        broker: 'interactive-brokers',
        type: isBuy ? 'BUY' : 'SELL',
        date,
        symbol: trade.symbol,
        description: `${isBuy ? 'Buy' : 'Sell'} ${desc}`,
        quantity: trade.quantity,
        pricePerUnit: trade.tradePrice,
        amount,
        currency,
        fees,
        amountInBaseCurrency,
      });
    }

    // --- Dividends → DIVIDEND ---
    const divCounters = new Map<string, number>();
    for (const div of stmt.dividends) {
      const symbol = parseSymbolFromDescription(div.description);
      const key = `${symbol}-${div.date}`;
      const count = (divCounters.get(key) ?? 0) + 1;
      divCounters.set(key, count);

      const info = instrumentMap.get(symbol);
      // Parse per-share rate from description
      const rateMatch = div.description.match(/([\d.]+)\s+per Share/);
      const perShareRate = rateMatch ? parseFloat(rateMatch[1]) : 0;

      let amountInBaseCurrency: number;
      if (div.currency === 'EUR') {
        amountInBaseCurrency = div.amount;
      } else {
        amountInBaseCurrency = convertAmount(div.amount, div.date, div.currency, 'EUR');
      }

      transactions.push({
        id: `ib-div-${symbol}-${div.date}-${count}`,
        broker: 'interactive-brokers',
        type: 'DIVIDEND',
        date: div.date,
        symbol,
        description: div.description,
        quantity: 0,
        pricePerUnit: perShareRate,
        amount: div.amount,
        currency: div.currency,
        fees: 0,
        amountInBaseCurrency,
      });
    }

    // --- Withholding Tax → TAX ---
    const taxCounters = new Map<string, number>();
    for (const tax of stmt.withholdingTax) {
      const symbol = parseSymbolFromDescription(tax.description);
      const key = `${symbol}-${tax.date}`;
      const count = (taxCounters.get(key) ?? 0) + 1;
      taxCounters.set(key, count);

      const absAmount = Math.abs(tax.amount);
      let amountInBaseCurrency: number;
      if (tax.currency === 'EUR') {
        amountInBaseCurrency = absAmount;
      } else {
        amountInBaseCurrency = convertAmount(absAmount, tax.date, tax.currency, 'EUR');
      }

      transactions.push({
        id: `ib-tax-${symbol}-${tax.date}-${count}`,
        broker: 'interactive-brokers',
        type: 'TAX',
        date: tax.date,
        symbol,
        description: tax.description,
        quantity: 0,
        pricePerUnit: 0,
        amount: absAmount,
        currency: tax.currency,
        fees: 0,
        amountInBaseCurrency,
      });
    }

    // --- Deposits & Withdrawals → TRANSFER ---
    for (let i = 0; i < stmt.deposits.length; i++) {
      const dep = stmt.deposits[i];
      const amount = Math.abs(dep.amount);

      let amountInBaseCurrency: number;
      if (dep.currency === 'EUR') {
        amountInBaseCurrency = amount;
      } else {
        amountInBaseCurrency = convertAmount(amount, dep.settleDate, dep.currency, 'EUR');
      }

      transactions.push({
        id: `ib-dep-${dep.settleDate}-${i + 1}`,
        broker: 'interactive-brokers',
        type: 'TRANSFER',
        date: dep.settleDate,
        symbol: '',
        description: dep.description,
        quantity: 0,
        pricePerUnit: 0,
        amount,
        currency: dep.currency,
        fees: 0,
        amountInBaseCurrency,
      });
    }

    // --- Interest → INTEREST ---
    for (let i = 0; i < stmt.interest.length; i++) {
      const int = stmt.interest[i];

      let amountInBaseCurrency: number;
      if (int.currency === 'EUR') {
        amountInBaseCurrency = int.amount;
      } else {
        amountInBaseCurrency = convertAmount(int.amount, int.date, int.currency, 'EUR');
      }

      transactions.push({
        id: `ib-int-${int.date}-${i + 1}`,
        broker: 'interactive-brokers',
        type: 'INTEREST',
        date: int.date,
        symbol: '',
        description: int.description,
        quantity: 0,
        pricePerUnit: 0,
        amount: int.amount,
        currency: int.currency,
        fees: 0,
        amountInBaseCurrency,
      });
    }

    // --- Fees → FEE ---
    for (let i = 0; i < stmt.fees.length; i++) {
      const fee = stmt.fees[i];
      const absAmount = Math.abs(fee.amount);

      let amountInBaseCurrency: number;
      if (fee.currency === 'EUR') {
        amountInBaseCurrency = absAmount;
      } else {
        amountInBaseCurrency = convertAmount(absAmount, fee.date, fee.currency, 'EUR');
      }

      transactions.push({
        id: `ib-fee-${fee.date}-${i + 1}`,
        broker: 'interactive-brokers',
        type: 'FEE',
        date: fee.date,
        symbol: '',
        description: fee.description,
        quantity: 0,
        pricePerUnit: 0,
        amount: absAmount,
        currency: fee.currency,
        fees: 0,
        amountInBaseCurrency,
      });
    }
  }

  return transactions;
}
