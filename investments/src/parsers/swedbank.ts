import type { Transaction } from './types.js';
import { parseCsvRows } from '../utils/csv.js';

/**
 * Swedbank bank-statement CSV parser.
 *
 * The export is not an investment statement — it is a raw bank ledger. Trade,
 * dividend and custody-fee activity all live as free-text in the `Details`
 * column. We classify each row based on regex matches against that text.
 *
 * Column layout (positional, the header row is also present verbatim):
 *   0 Account No
 *   1 (record type, unused)
 *   2 Date
 *   3 Beneficiary
 *   4 Details
 *   5 Amount  (always positive)
 *   6 Currency
 *   7 D/K     ('D' = debit / outflow, 'K' = credit / inflow)
 *   8 Reference No
 */

const TRADE_RE = /^([A-Z0-9.\-]+)\s+([+-]?\d+(?:\.\d+)?)@([\d.]+)/;
const COMMISSION_RE = /^K:\s+([A-Z0-9.\-]+)\s+([+-]?\d+(?:\.\d+)?)@([\d.]+)/;
const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;
const DIV_NAME_RE = /DIVIDENDAI(?:\s+UŽ)?[\s:\/]+([^\/,]+?)(?:\s+AB|\s+PVA|\s*,|\s*\/|ISIN)/i;
const DIV_RATE_RE = /([\d.]+)\s*EUR\s*\/\s*VNT/i;
const DIV_TAX_RATE_RE = /([\d.]+)\s*%\s*MOK/i;

const SKIP_CODES = new Set(['Opening balance', 'Closing balance', 'Turnover']);

export function parseSwedbank(csvText: string, sourceFile: string): Transaction[] {
  const rows = parseCsvRows(csvText);
  const out: Transaction[] = [];

  for (const row of rows) {
    if (row.length < 9) continue;
    const accountNo = row[0]?.trim();
    if (!accountNo || accountNo === 'Account No') continue;

    const date = row[2]?.trim();
    const beneficiary = row[3]?.trim();
    const details = row[4]?.trim() ?? '';
    const amountStr = row[5]?.trim();
    const currency = row[6]?.trim() || 'EUR';
    const dk = row[7]?.trim();
    const refNo = row[8]?.trim() || '';

    if (!date || !amountStr) continue;
    if (SKIP_CODES.has(details)) continue;

    const amt = Number(amountStr);
    if (!Number.isFinite(amt)) continue;

    const signed = dk === 'K' ? amt : -amt;

    const tx: Transaction = {
      id: refNo ? `swedbank:${refNo}` : `swedbank:${date}:${details.slice(0, 30)}:${amt}:${dk}`,
      broker: 'swedbank',
      sourceFile,
      timestamp: date,
      kind: 'fee',
      instrumentId: null,
      rawSymbol: null,
      amount: signed,
      currency,
      notes: details,
    };

    const commMatch = details.match(COMMISSION_RE);
    const tradeMatch = !commMatch ? details.match(TRADE_RE) : null;

    if (tradeMatch) {
      const [, symbol, qtyStr, priceStr] = tradeMatch;
      const qty = Number(qtyStr);
      const price = Number(priceStr);
      const isBuy = qty > 0;
      tx.kind = isBuy ? 'buy' : 'sell';
      tx.rawSymbol = symbol;
      tx.quantity = qty;
      tx.price = price;
    } else if (commMatch) {
      const [, symbol] = commMatch;
      tx.kind = 'fee';
      tx.rawSymbol = symbol;
      tx.notes = `Commission: ${details}`;
    } else if (/dividendai/i.test(details)) {
      tx.kind = 'dividend';
      const isin = details.match(ISIN_RE)?.[1];
      if (isin) tx.isin = isin;
      const name = details.match(DIV_NAME_RE)?.[1]?.trim();
      if (name) tx.rawSymbol = name;
      const rate = details.match(DIV_RATE_RE)?.[1];
      const taxPct = details.match(DIV_TAX_RATE_RE)?.[1];
      if (rate && taxPct) {
        const netRate = 1 - Number(taxPct) / 100;
        if (netRate > 0) {
          const gross = signed / netRate;
          const tax = gross - signed;
          tx.notes = `net=${signed.toFixed(2)} rate=${rate} EUR/sh withholding=${taxPct}% gross≈${gross.toFixed(2)} tax≈${tax.toFixed(2)}`;
        }
      }
    } else if (/VP\s+saugojimo\s+mokestis/i.test(details)) {
      tx.kind = 'fee';
      tx.notes = 'Custody fee';
    } else if (
      /Transfer between own accounts/i.test(details) ||
      /Pervedimas tarp savo sąskaitų/i.test(details) ||
      /Tarp savo sąskaitų/i.test(details) ||
      beneficiary === 'ARNOLDAS ŠEŠČILA'
    ) {
      tx.kind = 'internal';
    } else if (dk === 'K') {
      tx.kind = 'deposit';
    } else {
      tx.kind = 'withdrawal';
    }

    out.push(tx);
  }

  return out;
}
