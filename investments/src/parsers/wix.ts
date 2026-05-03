import type { Transaction } from './types.js';
import { stableHash } from '../utils/hash.js';

/**
 * Wix employer equity (RSU + ESPP) parser.
 *
 * Two files live under `/data/Investments/wix/`:
 *   - `shares-issued.txt` — one row per vested / purchased lot.
 *   - `shares-sold.txt`   — one row per sale of such a lot.
 *
 * Both are whitespace-delimited with no header. Dates are `dd/mm/yyyy` with
 * inconsistent zero-padding (`12/2/2018` and `12/02/2018` both appear).
 *
 * Issued row:
 *   grant_date grant_id plan(RSU|ESPP) vest_date qty fmv '$' cost_basis '$'
 *
 * Sold row:
 *   trade_id 'Sell of Restricted Stock' grant_id grant_date plan sale_date
 *     qty sale_price '$' cost_basis '$' fee '$'
 *
 * RSU vesting and ESPP purchases do not affect bank-cash in this account, so
 * issued rows emit a `buy` with `amount = 0` and `price = fmv` so cost basis
 * uses fair market value (the correct basis for later gain/loss).
 * Sold rows emit a `sell` with net proceeds = qty*price - fee.
 */

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function parseDate(raw: string): string | null {
  const m = raw.match(DATE_RE);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function classifyPlan(token: string): 'RSU' | 'ESPP' | null {
  if (token === 'RSU') return 'RSU';
  if (token === 'ESPP') return 'ESPP';
  return null;
}

function tokensOf(line: string): string[] {
  return line.trim().split(/\s+/).filter(t => t.length > 0 && t !== '$');
}

export function parseWix(text: string, sourceFile: string): Transaction[] {
  const out: Transaction[] = [];
  const isSold = /shares-sold/i.test(sourceFile);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const toks = tokensOf(line);
    if (toks.length < 5) continue;

    if (!isSold) {
      const grantDate = parseDate(toks[0]);
      const grantId = toks[1];
      const plan = classifyPlan(toks[2]);
      const vestDate = parseDate(toks[3]);
      const qty = Number(toks[4]);
      const fmv = Number(toks[5]);
      const cost = toks[6] !== undefined ? Number(toks[6]) : 0;
      if (!plan || !vestDate || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(fmv)) continue;

      out.push({
        id: `wix:issued:${stableHash(grantId, grantDate, vestDate, qty, fmv)}`,
        broker: 'wix',
        sourceFile,
        timestamp: vestDate,
        kind: 'buy',
        instrumentId: null,
        rawSymbol: 'WIX',
        quantity: qty,
        price: fmv,
        amount: 0,
        currency: 'USD',
        notes: `${plan} grant ${grantId} vested; FMV ${fmv.toFixed(2)} cost ${Number.isFinite(cost) ? cost.toFixed(2) : '?'}`,
      });
      continue;
    }

    const tradeId = toks[0];
    const grantIdIdx = toks.findIndex(t => /^(RSU|ESPP|ESPP\d+|\d{3,})$/.test(t) && t !== tradeId);
    if (grantIdIdx < 0) continue;

    let cursor = grantIdIdx;
    const grantId = toks[cursor++];
    const grantDate = parseDate(toks[cursor] ?? '');
    if (grantDate) cursor++;
    const plan = classifyPlan(toks[cursor]);
    if (plan) cursor++;
    const saleDate = parseDate(toks[cursor] ?? '');
    if (saleDate) cursor++;
    const qty = Number(toks[cursor++]);
    const price = Number(toks[cursor++]);
    const cost = Number(toks[cursor++]);
    const fee = Number(toks[cursor++]);

    if (!saleDate || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) continue;

    const proceeds = qty * price - (Number.isFinite(fee) ? fee : 0);
    out.push({
      id: `wix:sold:${tradeId || stableHash(grantId, saleDate, qty, price)}`,
      broker: 'wix',
      sourceFile,
      timestamp: saleDate,
      kind: 'sell',
      instrumentId: null,
      rawSymbol: 'WIX',
      quantity: -qty,
      price,
      amount: proceeds,
      currency: 'USD',
      notes: `Sold ${plan ?? ''} grant ${grantId}${Number.isFinite(cost) ? ` cost ${cost.toFixed(2)}` : ''}${Number.isFinite(fee) ? ` fee ${fee.toFixed(2)}` : ''}`,
    });
  }

  return out;
}
