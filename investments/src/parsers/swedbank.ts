import type { Transaction } from './types.js';
import { parseCsvRows } from '../utils/csv.js';

/**
 * Swedbank bank-statement CSV parser.
 *
 * The export is a raw bank ledger; trade and dividend activity live as
 * free-text in the `Details` column. Running cash balances aren't tracked,
 * but we do emit the cash flows we care about so they can be reasoned
 * about downstream:
 *
 *   - `SYMBOL ±qty@price …`             → buy/sell (D/K flips the sign)
 *   - `DIVIDENDAI …`                    → dividend (extracts ISIN +
 *                                         per-share rate + withholding %
 *                                         into notes)
 *   - `Pervedimas tarp savo sąskaitų`   → deposit / withdrawal
 *     `Tarp savo sąskaitų`                (transfer between user's own
 *                                         accounts; from this brokerage
 *                                         account's POV: K = cash in =
 *                                         deposit, D = cash out =
 *                                         withdrawal)
 *
 * Everything else (custody fees, mutual-fund `Fundorder` rows, opening /
 * closing balances, turnover totals) is dropped because it doesn't feed
 * into holdings, realized P&L, income, or external cash flows.
 *
 * Column layout (positional):
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
const COMMISSION_RE = /^K:\s+/;
const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;
const DIV_NAME_RE = /DIVIDENDAI(?:\s+UŽ)?[\s:\/]+([^\/,]+?)(?:\s+AB|\s+PVA|\s*,|\s*\/|ISIN)/i;
const DIV_RATE_RE = /([\d.]+)\s*EUR\s*\/\s*VNT/i;
const DIV_TAX_RATE_RE = /([\d.]+)\s*%\s*MOK/i;
// Lithuanian "Transfer between own accounts" — appears as either
// "Pervedimas tarp savo sąskaitų" or the abbreviated "Tarp savo sąskaitų".
// Both phrases share `tarp savo`, so a single accent-tolerant match is
// enough.
const OWN_TRANSFER_RE = /tarp savo/i;

export function parseSwedbank(csvText: string, sourceFile: string): Transaction[] {
  const rows = parseCsvRows(csvText);
  const out: Transaction[] = [];

  for (const row of rows) {
    if (row.length < 9) continue;
    const accountNo = row[0]?.trim();
    if (!accountNo || accountNo === 'Account No') continue;

    const date = row[2]?.trim();
    const details = row[4]?.trim() ?? '';
    const amountStr = row[5]?.trim();
    const currency = row[6]?.trim() || 'EUR';
    const dk = row[7]?.trim();
    const refNo = row[8]?.trim() || '';

    if (!date || !amountStr) continue;

    const amt = Number(amountStr);
    if (!Number.isFinite(amt)) continue;

    const signed = dk === 'K' ? amt : -amt;

    // Commission rows ("K: SYMBOL …") sit alongside the underlying trade
    // already accounted for via Net Amount, and we don't track cash, so skip.
    if (COMMISSION_RE.test(details)) continue;

    const tradeMatch = details.match(TRADE_RE);
    const isDividend = /dividendai/i.test(details);

    if (tradeMatch) {
      const [, symbol, qtyStr, priceStr] = tradeMatch;
      const qty = Number(qtyStr);
      const price = Number(priceStr);
      if (!Number.isFinite(qty) || qty === 0 || !Number.isFinite(price)) continue;
      const isBuy = qty > 0;
      out.push({
        id: refNo
          ? `swedbank:${refNo}`
          : `swedbank:${date}:${symbol}:${qty}:${price}:${dk}`,
        broker: 'swedbank',
        sourceFile,
        timestamp: date,
        kind: isBuy ? 'buy' : 'sell',
        instrumentId: null,
        rawSymbol: symbol,
        quantity: qty,
        price,
        amount: signed,
        currency,
        notes: details,
      });
      continue;
    }

    if (isDividend) {
      const isin = details.match(ISIN_RE)?.[1];
      const name = details.match(DIV_NAME_RE)?.[1]?.trim();
      const rate = details.match(DIV_RATE_RE)?.[1];
      const taxPct = details.match(DIV_TAX_RATE_RE)?.[1];
      let notes = details;
      if (rate && taxPct) {
        const netRate = 1 - Number(taxPct) / 100;
        if (netRate > 0) {
          const gross = signed / netRate;
          const tax = gross - signed;
          notes = `net=${signed.toFixed(2)} rate=${rate} EUR/sh withholding=${taxPct}% gross≈${gross.toFixed(2)} tax≈${tax.toFixed(2)}`;
        }
      }
      out.push({
        id: refNo
          ? `swedbank:${refNo}`
          : `swedbank:${date}:DIV:${isin ?? name ?? '?'}:${signed}`,
        broker: 'swedbank',
        sourceFile,
        timestamp: date,
        kind: 'dividend',
        instrumentId: null,
        rawSymbol: name ?? null,
        isin,
        amount: signed,
        currency,
        notes,
      });
      continue;
    }

    if (OWN_TRANSFER_RE.test(details)) {
      // K (credit) on this brokerage account = cash flowing in from the
      // user's other personal accounts → deposit. D (debit) is the
      // mirror outflow → withdrawal. Sign in `signed` already encodes
      // the direction (+ in / - out).
      const kind = dk === 'K' ? 'deposit' : 'withdrawal';
      out.push({
        id: refNo
          ? `swedbank:${refNo}`
          : `swedbank:${date}:${kind.toUpperCase()}:${signed}`,
        broker: 'swedbank',
        sourceFile,
        timestamp: date,
        kind,
        instrumentId: null,
        rawSymbol: null,
        amount: signed,
        currency,
        notes: details,
      });
      continue;
    }
    // Everything else (custody fees, mutual-fund `Fundorder` rows,
    // opening / closing / turnover rows) is intentionally dropped —
    // those don't represent an external cash flow and aren't part of
    // the canonical investment ledger.
  }

  return out;
}
