import type { RawTx, RawTxType } from './raw';
import { parseCsvRows } from '../csv';
import { stableHash } from '../hash';

/**
 * Interactive Brokers Transaction History parser.
 *
 * IB exports a single flat CSV: every row's first cell is the section name,
 * the second is `Header` or `Data`. Only the `Transaction History` section
 * carries activity; `Statement` and `Summary` are metadata we ignore.
 *
 * Column layout for `Transaction History,Data,...`:
 *   2 Date · 4 Description (for dividends/tax embeds `SYMBOL(ISIN)`) ·
 *   5 Transaction Type · 6 Symbol (`-` for cash rows) · 7 Quantity (signed) ·
 *   8 Price · 9 Price Currency · 12 Net Amount (pre-converted to EUR)
 *
 * Gross/Net Amount are pre-converted by IB to EUR. For trades we re-derive
 * the cash effect in *native* currency from `quantity * price` so cost basis
 * uses our ECB rates consistently across brokers (`amountIsEur: false`). For
 * dividends / tax / interest / deposits we trust IB's EUR Net Amount
 * (`amountIsEur: true`).
 *
 * Cash-side noise (Forex Trade Component, Adjustment, Other Fee, Sales Tax)
 * is dropped. `Foreign Tax Withholding` rows are emitted as raw `tax` rows;
 * normalization folds them into their dividend/interest counterpart.
 */

const SYMBOL_ISIN_RE = /^([A-Z0-9.\-]+)\s*\(([^)]+)\)/;
const ISIN_SHAPE_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/"/g, '').replace(/,/g, '').trim();
  if (!cleaned || cleaned === '-') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function takeSymbol(symbol: string | undefined): string | null {
  if (!symbol) return null;
  const trimmed = symbol.trim();
  if (!trimmed || trimmed === '-') return null;
  return trimmed;
}

export function parseInteractiveBrokers(csvText: string, sourceFile: string): RawTx[] {
  const rows = parseCsvRows(csvText);
  const out: RawTx[] = [];

  for (const row of rows) {
    if (row.length < 6) continue;
    if (row[0] !== 'Transaction History') continue;
    if (row[1] !== 'Data') continue;

    const date = row[2]?.trim();
    const description = (row[4] ?? '').trim();
    const txType = (row[5] ?? '').trim();
    const symbol = takeSymbol(row[6]);
    const qty = parseNumber(row[7]);
    const price = parseNumber(row[8]);
    const priceCurrency = (row[9] ?? '').trim();
    const netAmount = parseNumber(row[12]);
    if (!date) continue;

    const isinMatch = description.match(SYMBOL_ISIN_RE);
    const descSymbol = isinMatch?.[1] ?? null;
    const descIsin =
      isinMatch?.[2] && ISIN_SHAPE_RE.test(isinMatch[2]) ? isinMatch[2] : null;
    const effectiveSymbol = symbol ?? descSymbol;

    switch (txType) {
      case 'Buy':
      case 'Sell': {
        if (!symbol || qty === 0 || price === 0) continue;
        const currency = priceCurrency || 'EUR';
        // `netAmount` is in the dedupe hash to discriminate two same-day
        // executions of the same (symbol, qty, price) that only differ in
        // commission — IB occasionally splits one order into two such fills.
        out.push({
          id: `ib:${stableHash('trade', symbol, date, qty, price, netAmount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          date,
          type: qty > 0 ? 'buy' : 'sell',
          rawSymbol: symbol,
          isin: null,
          quantity: qty,
          price,
          amount: -qty * price,
          currency,
          amountIsEur: false,
          gross: null,
          tax: null,
          note: description,
        });
        break;
      }
      case 'Dividend':
      case 'Foreign Tax Withholding': {
        if (netAmount === 0) continue;
        const type: RawTxType = txType === 'Dividend' ? 'dividend' : 'tax';
        // Withholding rows whose Symbol column is `-` are credit-interest
        // withholding ("Withholding @ 20% on Credit Interest for…"). Their
        // rawSymbol stays null; normalization folds them into the matching
        // `interest` row by date instead of surfacing a fake ticker.
        out.push({
          id: `ib:${stableHash(type, effectiveSymbol ?? '-', date, description, netAmount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          date,
          type,
          rawSymbol: effectiveSymbol,
          isin: descIsin,
          quantity: null,
          price: null,
          amount: netAmount,
          currency: 'EUR',
          amountIsEur: true,
          gross: null,
          tax: null,
          note: description,
        });
        break;
      }
      case 'Credit Interest': {
        if (netAmount === 0) continue;
        out.push({
          id: `ib:${stableHash('interest', date, description, netAmount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          date,
          type: 'interest',
          rawSymbol: null,
          isin: null,
          quantity: null,
          price: null,
          amount: netAmount,
          currency: 'EUR',
          amountIsEur: true,
          gross: null,
          tax: null,
          note: description,
        });
        break;
      }
      case 'Deposit':
      case 'Withdrawal': {
        if (netAmount === 0) continue;
        // IB's Deposit row has a positive Net Amount, Withdrawal a negative
        // one — both already in EUR; the sign carries the direction.
        out.push({
          id: `ib:${stableHash(txType.toLowerCase(), date, description, netAmount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          date,
          type: txType === 'Deposit' ? 'deposit' : 'withdrawal',
          rawSymbol: null,
          isin: null,
          quantity: null,
          price: null,
          amount: netAmount,
          currency: 'EUR',
          amountIsEur: true,
          gross: null,
          tax: null,
          note: description,
        });
        break;
      }
      default:
        break;
    }
  }

  return out;
}
