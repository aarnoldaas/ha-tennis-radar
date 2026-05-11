import type { Transaction, TxKind } from './types.js';
import { parseCsvRows } from '../utils/csv.js';
import { stableHash } from '../utils/hash.js';

/**
 * Interactive Brokers Transaction History parser.
 *
 * IB now exports a single flat "Transaction History" CSV: every row's first
 * cell is the section name, the second is `Header` or `Data`. Only the
 * `Transaction History` section carries activity; `Statement` and `Summary`
 * are metadata we ignore.
 *
 * Column layout for `Transaction History,Data,...`:
 *   2  Date              YYYY-MM-DD
 *   3  Account           (ignored, always the same masked id)
 *   4  Description       Free text — for dividends/tax it embeds SYMBOL(ISIN)
 *   5  Transaction Type  Buy | Sell | Dividend | Foreign Tax Withholding |
 *                        Credit Interest | Other Fee | Sales Tax |
 *                        Forex Trade Component | Adjustment |
 *                        Deposit | Withdrawal
 *   6  Symbol            Ticker (or `-` for cash-only rows)
 *   7  Quantity          Signed (positive = shares in)
 *   8  Price             Per-unit, in Price Currency
 *   9  Price Currency    Native trade currency (USD, EUR, CNH, …)
 *   10 Gross Amount      Already converted to base EUR
 *   11 Commission        In base EUR
 *   12 Net Amount        Already converted to base EUR
 *
 * Important: Gross/Net Amount are pre-converted by IB to the base currency
 * (EUR). For trades we re-derive the cash effect in *native* currency from
 * `quantity * price`, then let our ECB FX layer handle the conversion so cost
 * basis stays consistent with every other instrument across the portfolio.
 * For dividends / tax / interest we trust IB's base-currency Net Amount —
 * those are already final.
 *
 * Cash-only rows are mostly dropped (Forex Trade Component, Adjustment,
 * Other Fee, Sales Tax). The two exceptions are `Deposit` and `Withdrawal`
 * — those are external cash flows in/out of the brokerage account that the
 * Cashflow tab surfaces for contribution tracking. We do not track running
 * cash balances anywhere; we just list these flows.
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

export function parseInteractiveBrokers(csvText: string, sourceFile: string): Transaction[] {
  const rows = parseCsvRows(csvText);
  const out: Transaction[] = [];

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
      isinMatch?.[2] && ISIN_SHAPE_RE.test(isinMatch[2]) ? isinMatch[2] : undefined;
    const effectiveSymbol = symbol ?? descSymbol;

    switch (txType) {
      case 'Buy':
      case 'Sell': {
        if (!symbol || qty === 0 || price === 0) continue;
        const currency = priceCurrency || 'EUR';
        // IB pre-converts Gross/Net to EUR; we re-derive native cash flow
        // from qty * price so downstream FIFO + FX uses consistent ECB rates.
        const amountNative = -qty * price;
        // `netAmount` is included in the dedupe hash to discriminate two
        // distinct same-day executions of the same (symbol, qty, price)
        // that only differ in commission — IB occasionally splits a single
        // order into two fills like that.
        out.push({
          id: `ib:${stableHash('trade', symbol, date, qty, price, netAmount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          timestamp: date,
          kind: qty > 0 ? 'buy' : 'sell',
          instrumentId: null,
          rawSymbol: symbol,
          quantity: qty,
          price,
          amount: amountNative,
          currency,
          notes: description,
        });
        break;
      }
      case 'Dividend':
      case 'Foreign Tax Withholding': {
        if (netAmount === 0) continue;
        const kind: TxKind = txType === 'Dividend' ? 'dividend' : 'tax';
        // Withholding-tax rows whose Symbol column is `-` are credit-interest
        // withholding (e.g. "Withholding @ 20% on Credit Interest for…").
        // Leave rawSymbol `null` so they don't surface as a fake ticker in
        // the Transactions / Mappings UI; income aggregation rebinds them
        // to their `Credit Interest` counterpart by sniffing the description.
        const sym = effectiveSymbol;
        out.push({
          id: `ib:${stableHash(kind, sym ?? '-', date, description, netAmount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          timestamp: date,
          kind,
          instrumentId: null,
          rawSymbol: sym,
          isin: descIsin,
          amount: netAmount,
          currency: 'EUR',
          notes: description,
        });
        break;
      }
      case 'Credit Interest': {
        if (netAmount === 0) continue;
        out.push({
          id: `ib:${stableHash('interest', date, description, netAmount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          timestamp: date,
          kind: 'interest',
          instrumentId: null,
          rawSymbol: null,
          amount: netAmount,
          currency: 'EUR',
          notes: description,
        });
        break;
      }
      case 'Deposit':
      case 'Withdrawal': {
        if (netAmount === 0) continue;
        // IB's Deposit row has a positive Net Amount, Withdrawal a negative
        // one — both already in base EUR. We trust those signs as-is so the
        // ledger amount carries the cash-flow direction.
        out.push({
          id: `ib:${stableHash(txType.toLowerCase(), date, description, netAmount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          timestamp: date,
          kind: txType === 'Deposit' ? 'deposit' : 'withdrawal',
          instrumentId: null,
          rawSymbol: null,
          amount: netAmount,
          currency: 'EUR',
          notes: description,
        });
        break;
      }
      // Forex Trade Component, Adjustment, Other Fee, Sales Tax are
      // cash-side noise that doesn't represent an external transfer —
      // skipped.
      default:
        break;
    }
  }

  return out;
}
