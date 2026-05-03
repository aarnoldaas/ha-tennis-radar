import type { Transaction } from './types.js';
import { stableHash } from '../utils/hash.js';

/**
 * Revolut parser — summary-only.
 *
 * Revolut's export for flexible cash funds / savings / brokerage is a
 * human-readable aggregate; it does not expose a per-trade ledger we can
 * merge with Swedbank / IB / Wix on equal footing. Rather than invent
 * synthetic trade rows (which would pollute cost-basis maths), we emit only:
 *
 *   - one `interest` transaction per (section, currency) for lifetime earned
 *   - one `fee` transaction per (section, currency) for lifetime fees
 *   - one `deposit` per (section, currency) reflecting the closing balance
 *     so the Cash tab shows non-zero balances where they exist
 *
 * Timestamps use the inclusive end-date of the export filename when present,
 * otherwise today. This keeps Revolut visible in Income/Cash but intentionally
 * absent from Holdings / Realized P&L.
 */

const SECTION_RE = /^Summary for\s+(.+?)\s*$/;
const END_DATE_IN_FILENAME_RE = /_(\d{4}-\d{2}-\d{2})(?:\.|$)/;

function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/"/g, '')
    .replace(/[€$£]/g, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function detectCurrency(label: string, valueRaw: string): string {
  if (label.includes('EUR') || valueRaw.includes('€')) return 'EUR';
  if (label.includes('USD') || valueRaw.includes('$')) return 'USD';
  if (label.includes('GBP') || valueRaw.includes('£')) return 'GBP';
  return 'EUR';
}

function asOfFromFilename(filename: string): string {
  const m = filename.match(END_DATE_IN_FILENAME_RE);
  if (m) return m[1];
  return new Date().toISOString().slice(0, 10);
}

export function parseRevolut(text: string, sourceFile: string): Transaction[] {
  const out: Transaction[] = [];
  const asOf = asOfFromFilename(sourceFile);

  const lines = text.split(/\r?\n/);
  let currentSection: string | null = null;
  let inSummary = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      inSummary = true;
      continue;
    }
    if (/^Transactions for/i.test(line)) {
      inSummary = false;
      continue;
    }
    if (!inSummary || !currentSection) continue;

    const [labelRaw, valueRaw = ''] = line.split(',', 2);
    const label = labelRaw.trim();
    const currency = detectCurrency(currentSection, valueRaw);

    if (/^Total earned interest$/i.test(label)) {
      const gross = parseMoney(valueRaw);
      if (gross && gross > 0) {
        out.push({
          id: `revolut:${stableHash('interest', currentSection, currency, gross)}`,
          broker: 'revolut',
          sourceFile,
          timestamp: asOf,
          kind: 'interest',
          instrumentId: null,
          rawSymbol: null,
          amount: gross,
          currency,
          notes: `${currentSection} — lifetime earned interest`,
        });
      }
    } else if (/^Total fee$/i.test(label)) {
      const fee = parseMoney(valueRaw);
      if (fee && fee > 0) {
        out.push({
          id: `revolut:${stableHash('fee', currentSection, currency, fee)}`,
          broker: 'revolut',
          sourceFile,
          timestamp: asOf,
          kind: 'fee',
          instrumentId: null,
          rawSymbol: null,
          amount: -fee,
          currency,
          notes: `${currentSection} — lifetime fees`,
        });
      }
    } else if (/^Closing balance$/i.test(label)) {
      const bal = parseMoney(valueRaw);
      if (bal && bal > 0) {
        out.push({
          id: `revolut:${stableHash('balance', currentSection, currency, bal)}`,
          broker: 'revolut',
          sourceFile,
          timestamp: asOf,
          kind: 'deposit',
          instrumentId: null,
          rawSymbol: null,
          amount: bal,
          currency,
          notes: `${currentSection} — reported closing balance`,
        });
      }
    } else if (/^Dividends$/i.test(label)) {
      const amt = parseMoney(valueRaw);
      if (amt && amt !== 0) {
        out.push({
          id: `revolut:${stableHash('dividend', currentSection, currency, amt)}`,
          broker: 'revolut',
          sourceFile,
          timestamp: asOf,
          kind: 'dividend',
          instrumentId: null,
          rawSymbol: null,
          amount: amt,
          currency,
          notes: `${currentSection} — lifetime dividends`,
        });
      }
    }
  }

  return out;
}
