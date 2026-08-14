import type { RawTx } from './raw';
import { parseCsvRows } from '../csv';

/**
 * Swedbank bank-statement CSV parser.
 *
 * The export is a raw bank ledger; trade and dividend activity live as
 * free-text in the `Details` column:
 *
 *   - `SYMBOL ±qty@price …`             → buy/sell (D/K flips the sign)
 *   - `DIVIDENDAI …`                    → dividend (ISIN + per-share rate +
 *                                         withholding % extracted; gross/tax
 *                                         computed as structured fields)
 *   - `Pervedimas tarp savo sąskaitų` /
 *     `Tarp savo sąskaitų`              → deposit / withdrawal (transfer
 *                                         between the user's own accounts;
 *                                         K = cash in, D = cash out)
 *
 * Everything else (custody fees, `Fundorder` rows, opening/closing balances,
 * turnover totals) is dropped — it doesn't feed holdings, realized P&L,
 * income, or external cash flows.
 *
 * Column layout (positional):
 *   0 Account No · 2 Date · 4 Details · 5 Amount (always positive) ·
 *   6 Currency · 7 D/K ('D' = debit/out, 'K' = credit/in) · 8 Reference No
 */

const TRADE_RE = /^([A-Z0-9.\-]+)\s+([+-]?\d+(?:\.\d+)?)@([\d.]+)/;
const COMMISSION_RE = /^K:\s+/;
const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;
const DIV_NAME_RE = /DIVIDENDAI(?:\s+UŽ)?[\s:\/]+([^\/,]+?)(?:\s+AB|\s+PVA|\s*,|\s*\/|ISIN)/i;
const DIV_TAX_RATE_RE = /([\d.]+)\s*%\s*MOK/i;
const OWN_TRANSFER_RE = /tarp savo/i;

export function parseSwedbank(csvText: string, sourceFile: string): RawTx[] {
  const rows = parseCsvRows(csvText);
  const out: RawTx[] = [];

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
    // already accounted for via Net Amount — skip.
    if (COMMISSION_RE.test(details)) continue;

    const tradeMatch = details.match(TRADE_RE);
    const isDividend = /dividendai/i.test(details);

    if (tradeMatch) {
      const [, symbol, qtyStr, priceStr] = tradeMatch;
      const qty = Number(qtyStr);
      const price = Number(priceStr);
      if (!Number.isFinite(qty) || qty === 0 || !Number.isFinite(price)) continue;
      out.push({
        id: refNo
          ? `swedbank:${refNo}`
          : `swedbank:${date}:${symbol}:${qty}:${price}:${dk}`,
        broker: 'swedbank',
        sourceFile,
        date,
        type: qty > 0 ? 'buy' : 'sell',
        rawSymbol: symbol,
        isin: null,
        quantity: qty,
        price,
        amount: signed,
        currency,
        amountIsEur: false,
        gross: null,
        tax: null,
        note: details,
      });
      continue;
    }

    if (isDividend) {
      const isin = details.match(ISIN_RE)?.[1] ?? null;
      const name = details.match(DIV_NAME_RE)?.[1]?.trim();
      const taxPct = details.match(DIV_TAX_RATE_RE)?.[1];
      // The statement amount is net of withholding. When the details text
      // carries the withholding % we back out the gross so income reporting
      // gets structured gross/tax instead of just the net.
      let gross: number | null = null;
      let tax: number | null = null;
      if (taxPct) {
        const netRate = 1 - Number(taxPct) / 100;
        if (netRate > 0 && netRate <= 1) {
          gross = signed / netRate;
          tax = gross - signed;
        }
      }
      out.push({
        id: refNo
          ? `swedbank:${refNo}`
          : `swedbank:${date}:DIV:${isin ?? name ?? '?'}:${signed}`,
        broker: 'swedbank',
        sourceFile,
        date,
        type: 'dividend',
        rawSymbol: name ?? null,
        isin,
        quantity: null,
        price: null,
        amount: signed,
        currency,
        amountIsEur: false,
        gross,
        tax,
        note: details,
      });
      continue;
    }

    if (OWN_TRANSFER_RE.test(details)) {
      const type = dk === 'K' ? 'deposit' : 'withdrawal';
      out.push({
        id: refNo
          ? `swedbank:${refNo}`
          : `swedbank:${date}:${type.toUpperCase()}:${signed}`,
        broker: 'swedbank',
        sourceFile,
        date,
        type,
        rawSymbol: null,
        isin: null,
        quantity: null,
        price: null,
        amount: signed,
        currency,
        amountIsEur: false,
        gross: null,
        tax: null,
        note: details,
      });
      continue;
    }
  }

  return out;
}
