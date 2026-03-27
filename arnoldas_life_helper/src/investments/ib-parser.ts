import Papa from 'papaparse';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IInteractiveBrokersTransaction, ITransaction } from './types.js';
import { convertAmount } from './currency.js';

// ============================================================================
// Helpers
// ============================================================================

/** Parse IB date "MM/DD/YYYY" → "YYYY-MM-DD" */
function parseIBDate(dateStr: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return '';
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/** CSV column name → IInteractiveBrokersTransaction field mapping */
function mapRow(row: Record<string, string>): IInteractiveBrokersTransaction {
  return {
    clientAccountId: row['ClientAccountID'] || '',
    currencyPrimary: row['CurrencyPrimary'] || '',
    fxRateToBase: parseFloat(row['FXRateToBase']) || 0,
    assetClass: (row['AssetClass'] || 'STK') as 'STK' | 'CASH',
    subCategory: row['SubCategory'] || '',
    symbol: row['Symbol'] || '',
    description: row['Description'] || '',
    isin: row['ISIN'] || '',
    listingExchange: row['ListingExchange'] || '',
    tradeId: row['TradeID'] || '',
    tradeDate: row['TradeDate'] || '',
    dateTime: row['DateTime'] || '',
    quantity: parseFloat(row['Quantity']) || 0,
    tradePrice: parseFloat(row['TradePrice']) || 0,
    tradeMoney: parseFloat(row['TradeMoney']) || 0,
    proceeds: parseFloat(row['Proceeds']) || 0,
    taxes: parseFloat(row['Taxes']) || 0,
    ibCommission: parseFloat(row['IBCommission']) || 0,
    ibCommissionCurrency: row['IBCommissionCurrency'] || '',
    netCash: parseFloat(row['NetCash']) || 0,
    closePrice: parseFloat(row['ClosePrice']) || 0,
    openCloseIndicator: row['Open/CloseIndicator'] || '',
    costBasis: parseFloat(row['CostBasis']) || 0,
    fifoPnlRealized: parseFloat(row['FifoPnlRealized']) || 0,
    mtmPnl: parseFloat(row['MtmPnl']) || 0,
    buySell: (row['Buy/Sell'] || 'BUY') as 'BUY' | 'SELL',
  };
}

// ============================================================================
// File-level parser
// ============================================================================

export async function parseIBFile(filePath: string): Promise<IInteractiveBrokersTransaction[]> {
  const content = readFileSync(filePath, 'utf-8');
  const result = Papa.parse(content, { header: true, skipEmptyLines: true });
  return (result.data as Record<string, string>[]).map(mapRow);
}

export async function parseAllIBFiles(dirPath: string): Promise<IInteractiveBrokersTransaction[]> {
  if (!existsSync(dirPath)) return [];

  const files = readdirSync(dirPath).filter(f => f.endsWith('.csv')).sort();
  const all: IInteractiveBrokersTransaction[] = [];

  for (const file of files) {
    const txns = await parseIBFile(join(dirPath, file));
    all.push(...txns);
  }

  return all;
}

// ============================================================================
// Classify into ITransaction[]
// ============================================================================

export function classifyIBTransactions(rawTxns: IInteractiveBrokersTransaction[]): ITransaction[] {
  const transactions: ITransaction[] = [];

  for (const txn of rawTxns) {
    // Skip forex conversions — they are internal cash movements, not investment transactions
    if (txn.assetClass === 'CASH') continue;

    const date = parseIBDate(txn.tradeDate);
    const isBuy = txn.buySell === 'BUY';
    const qty = txn.quantity;
    const fees = Math.abs(txn.ibCommission) + Math.abs(txn.taxes);
    const amount = Math.abs(txn.tradeMoney);
    const currency = txn.currencyPrimary;

    // Convert to EUR base currency
    let amountInBaseCurrency: number;
    if (currency === 'EUR') {
      amountInBaseCurrency = amount;
    } else if (txn.fxRateToBase > 0) {
      // fxRateToBase is the rate from transaction currency to account base currency (EUR)
      amountInBaseCurrency = amount * txn.fxRateToBase;
    } else {
      amountInBaseCurrency = convertAmount(amount, date, currency, 'EUR');
    }

    transactions.push({
      id: `ib-${txn.tradeId}`,
      broker: 'interactive-brokers',
      type: isBuy ? 'BUY' : 'SELL',
      date,
      symbol: txn.symbol,
      description: `${isBuy ? 'Buy' : 'Sell'} ${txn.description}`,
      quantity: qty,
      pricePerUnit: txn.tradePrice,
      amount,
      currency,
      fees,
      amountInBaseCurrency,
    });
  }

  return transactions;
}
