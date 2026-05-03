import yaml from 'js-yaml';
import type { BrokerKey, Instrument, UnresolvedAlias } from '../parsers/types.js';
import instrumentsYaml from './instruments.yaml';

/**
 * Curated instrument master. Built once at module load from the embedded YAML.
 * The YAML is inlined at build time via esbuild's `text` loader.
 */
const INSTRUMENTS: Instrument[] = (yaml.load(instrumentsYaml as unknown as string) as Instrument[]) ?? [];

/**
 * (broker, rawSymbolUpper) -> instrumentId. Built once; O(1) lookup.
 */
const ALIAS_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const inst of INSTRUMENTS) {
    for (const [broker, aliases] of Object.entries(inst.aliases)) {
      const list = Array.isArray(aliases) ? aliases : [aliases];
      for (const a of list) {
        if (!a) continue;
        m.set(aliasKey(broker as BrokerKey, a), inst.id);
      }
    }
  }
  return m;
})();

const ISIN_INDEX: Map<string, string> = new Map(
  INSTRUMENTS.filter(i => i.isin).map(i => [i.isin!.toUpperCase(), i.id] as const),
);

const ID_INDEX: Map<string, Instrument> = new Map(INSTRUMENTS.map(i => [i.id, i]));

function aliasKey(broker: BrokerKey, symbol: string): string {
  return `${broker}::${symbol.trim().toUpperCase()}`;
}

export interface UnresolvedTracker {
  record(broker: BrokerKey, rawSymbol: string, sampleTxId: string, isin?: string): void;
  toArray(): UnresolvedAlias[];
}

export function createUnresolvedTracker(): UnresolvedTracker {
  const map = new Map<string, UnresolvedAlias>();
  return {
    record(broker, rawSymbol, sampleTxId, isin) {
      const key = aliasKey(broker, rawSymbol);
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { broker, rawSymbol, isin, count: 1, sampleTxId });
      }
    },
    toArray() {
      return [...map.values()].sort((a, b) => b.count - a.count);
    },
  };
}

/**
 * Resolve a broker-native symbol/ISIN pair to our canonical `instrumentId`.
 * Prefers ISIN match when provided (more robust across brokers), falls back to
 * the alias map keyed on (broker, symbol). Returns null if no match.
 */
export function resolveInstrument(
  broker: BrokerKey,
  rawSymbol: string | null | undefined,
  isin?: string | null,
): string | null {
  if (isin) {
    const hit = ISIN_INDEX.get(isin.toUpperCase());
    if (hit) return hit;
  }
  if (!rawSymbol) return null;
  return ALIAS_INDEX.get(aliasKey(broker, rawSymbol)) ?? null;
}

export function getInstrument(id: string): Instrument | undefined {
  return ID_INDEX.get(id);
}

export function allInstruments(): Instrument[] {
  return [...INSTRUMENTS];
}
