import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BrokerKey, Transaction, UnresolvedAlias } from '../parsers/types.js';
import { BROKER_KEYS } from '../parsers/types.js';
import { parseSwedbank } from '../parsers/swedbank.js';
import { parseInteractiveBrokers } from '../parsers/interactive-brokers.js';
import { createUnresolvedTracker, resolveInstrument } from '../config/instruments.js';

export interface LedgerResult {
  transactions: Transaction[];
  unresolved: UnresolvedAlias[];
  sourceSummary: Array<{ broker: BrokerKey; file: string; rows: number }>;
}

function parserFor(broker: BrokerKey): (text: string, source: string) => Transaction[] {
  switch (broker) {
    case 'swedbank':
      return parseSwedbank;
    case 'interactive-brokers':
      return parseInteractiveBrokers;
  }
}

/**
 * Walk `<dataDir>/Investments/<broker>/*` and build the canonical ledger:
 *   1. Parse each file with its broker-specific parser.
 *   2. De-duplicate by `Transaction.id` (absorbs overlapping year exports).
 *   3. Resolve `rawSymbol`/`isin` to a canonical `instrumentId` via the
 *      curated master; unresolved pairs bubble up for UI curation.
 *   4. Sort chronologically.
 */
export function buildLedger(dataDir: string): LedgerResult {
  const root = join(dataDir, 'Investments');
  const tracker = createUnresolvedTracker();
  const byId = new Map<string, Transaction>();
  const sourceSummary: LedgerResult['sourceSummary'] = [];

  for (const broker of BROKER_KEYS) {
    const brokerDir = join(root, broker);
    if (!existsSync(brokerDir)) continue;
    for (const name of readdirSync(brokerDir)) {
      const full = join(brokerDir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      if (name.startsWith('.')) continue;
      let text: string;
      try {
        text = readFileSync(full, 'utf-8');
      } catch {
        continue;
      }

      const parser = parserFor(broker);
      let parsed: Transaction[];
      try {
        parsed = parser(text, name);
      } catch (e) {
        parsed = [];
      }
      sourceSummary.push({ broker, file: name, rows: parsed.length });

      for (const tx of parsed) {
        if (!byId.has(tx.id)) byId.set(tx.id, tx);
      }
    }
  }

  const resolved: Transaction[] = [];
  for (const tx of byId.values()) {
    const hit = resolveInstrument(tx.broker, tx.rawSymbol, tx.isin);
    if (hit) {
      resolved.push({ ...tx, instrumentId: hit });
    } else {
      if (
        tx.rawSymbol &&
        (tx.kind === 'buy' || tx.kind === 'sell' || tx.kind === 'dividend' || tx.kind === 'tax')
      ) {
        tracker.record(tx.broker, tx.rawSymbol, tx.id, tx.isin);
      }
      resolved.push(tx);
    }
  }

  resolved.sort((a, b) => {
    const d = a.timestamp.localeCompare(b.timestamp);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });

  return { transactions: resolved, unresolved: tracker.toArray(), sourceSummary };
}
