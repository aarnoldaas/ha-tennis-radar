import type { Transaction } from './types.js';
import { parseCsvRows } from '../utils/csv.js';
import { stableHash } from '../utils/hash.js';

/**
 * Interactive Brokers Activity Statement parser.
 *
 * The IB export is a many-sectioned "pseudo-CSV": each row's first cell is the
 * section name, the second is either `Header` or `Data`. We only care about
 * five sections:
 *
 *   - `Trades`           → buy/sell for Asset Category = Stocks
 *   - `Dividends`        → dividend
 *   - `Withholding Tax`  → tax
 *   - `Fees`             → fee
 *   - `Deposits & Withdrawals` → deposit/withdrawal
 *
 * Every other section (Mark-to-Market Performance Summary, Realized &
 * Unrealized Performance Summary, Change in Dividend Accruals, Open Positions,
 * Financial Instrument Information …) is derived by IB and intentionally
 * skipped — we rebuild them ourselves from the canonical ledger so nothing
 * can drift.
 */

const SYMBOL_ISIN_RE = /^([A-Z0-9.\-]+)\s*\(([^)]+)\)/;

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/"/g, '').replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseIbDate(raw: string): string {
  const cleaned = raw.replace(/"/g, '').trim();
  const datePart = cleaned.split(',')[0]?.trim() ?? cleaned;
  return datePart;
}

export function parseInteractiveBrokers(csvText: string, sourceFile: string): Transaction[] {
  const rows = parseCsvRows(csvText);
  const out: Transaction[] = [];

  for (const row of rows) {
    if (row.length < 3) continue;
    const section = row[0];
    const kind = row[1];
    if (kind !== 'Data') continue;

    switch (section) {
      case 'Trades': {
        const assetCategory = row[3];
        if (assetCategory !== 'Stocks') continue;

        const discriminator = row[2];
        if (discriminator !== 'Order' && discriminator !== 'Trade') continue;

        const currency = row[4];
        const symbol = row[5];
        const dateRaw = row[6];
        const qty = parseNumber(row[7]);
        const price = parseNumber(row[8]);
        const proceeds = parseNumber(row[10]);
        const commFee = parseNumber(row[11]);

        if (!symbol || !currency || !dateRaw || qty === 0) continue;

        const timestamp = parseIbDate(dateRaw);
        const id = `ib:${stableHash('trade', symbol, dateRaw, qty, proceeds)}`;
        const isBuy = qty > 0;

        out.push({
          id,
          broker: 'interactive-brokers',
          sourceFile,
          timestamp,
          kind: isBuy ? 'buy' : 'sell',
          instrumentId: null,
          rawSymbol: symbol,
          quantity: qty,
          price,
          amount: proceeds + commFee,
          currency,
          notes: commFee ? `Commission: ${commFee.toFixed(4)}` : undefined,
        });
        break;
      }
      case 'Dividends':
      case 'Withholding Tax': {
        const currency = row[2];
        if (currency === 'Total' || !currency || currency.startsWith('Total')) continue;

        const date = row[3];
        const description = row[4];
        const amount = parseNumber(row[5]);
        if (!date || !description) continue;

        const m = description.match(SYMBOL_ISIN_RE);
        const sym = m?.[1] ?? null;
        const isin = m?.[2];

        out.push({
          id: `ib:${stableHash(section, currency, date, description, amount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          timestamp: date,
          kind: section === 'Dividends' ? 'dividend' : 'tax',
          instrumentId: null,
          rawSymbol: sym,
          isin: isin && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : undefined,
          amount,
          currency,
          notes: description,
        });
        break;
      }
      case 'Fees': {
        const currency = row[3];
        if (currency === 'Total' || !currency || currency.startsWith('Total')) continue;
        const date = row[4];
        const description = row[5];
        const amount = parseNumber(row[6]);
        if (!date) continue;

        const m = description?.match(SYMBOL_ISIN_RE);
        out.push({
          id: `ib:${stableHash('fee', currency, date, description, amount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          timestamp: date,
          kind: 'fee',
          instrumentId: null,
          rawSymbol: m?.[1] ?? null,
          isin: m?.[2] && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(m[2]) ? m[2] : undefined,
          amount,
          currency,
          notes: description,
        });
        break;
      }
      case 'Deposits & Withdrawals': {
        const currency = row[2];
        if (currency === 'Total' || !currency || currency.startsWith('Total')) continue;
        const date = row[3];
        const description = row[4];
        const amount = parseNumber(row[5]);
        if (!date) continue;

        out.push({
          id: `ib:${stableHash('dw', currency, date, description, amount)}`,
          broker: 'interactive-brokers',
          sourceFile,
          timestamp: date,
          kind: amount >= 0 ? 'deposit' : 'withdrawal',
          instrumentId: null,
          rawSymbol: null,
          amount,
          currency,
          notes: description,
        });
        break;
      }
      default:
        break;
    }
  }

  return out;
}
