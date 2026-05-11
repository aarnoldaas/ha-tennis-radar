import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import yaml from 'js-yaml';
import type {
  AssetClass,
  BrokerKey,
  Instrument,
  PriceSource,
  UnresolvedAlias,
} from '../parsers/types.js';
import bundledBaselineYaml from './instruments.yaml';

/**
 * Runtime instrument master.
 *
 * The repository ships a curated baseline (`instruments.yaml` inlined into the
 * bundle via esbuild's text loader). On first boot we copy that baseline to
 * `<dataDir>/instruments.yaml`; thereafter the runtime file is the source of
 * truth and the UI Mappings tab can rewrite it. The baseline acts purely as a
 * seed.
 *
 * Indices (alias / ISIN / id) are rebuilt from the live `INSTRUMENTS` array
 * each time `reloadInstruments()` runs. Resolution and lookup helpers always
 * consult the live state, so the YAML can be mutated mid-run without a
 * process restart — the portfolio service simply needs to bust its cache,
 * which it does via the `instruments.yaml` mtime entry in its fingerprint.
 */

const BASELINE_YAML: string = (bundledBaselineYaml as unknown as string) ?? '';

let storePath: string | null = null;
let INSTRUMENTS: Instrument[] = parseYaml(BASELINE_YAML);
let ALIAS_INDEX: Map<string, string> = new Map();
let ISIN_INDEX: Map<string, string> = new Map();
let ID_INDEX: Map<string, Instrument> = new Map();
rebuildIndices();

function parseYaml(text: string): Instrument[] {
  try {
    return (yaml.load(text) as Instrument[]) ?? [];
  } catch {
    return [];
  }
}

function rebuildIndices() {
  ALIAS_INDEX = new Map();
  ISIN_INDEX = new Map();
  ID_INDEX = new Map();
  for (const inst of INSTRUMENTS) {
    ID_INDEX.set(inst.id, inst);
    if (inst.isin) ISIN_INDEX.set(inst.isin.toUpperCase(), inst.id);
    for (const [broker, aliases] of Object.entries(inst.aliases ?? {})) {
      const list = Array.isArray(aliases) ? aliases : aliases ? [aliases] : [];
      for (const a of list) {
        if (!a) continue;
        ALIAS_INDEX.set(aliasKey(broker as BrokerKey, a), inst.id);
      }
    }
  }
}

function aliasKey(broker: BrokerKey, symbol: string): string {
  return `${broker}::${symbol.trim().toUpperCase()}`;
}

/**
 * Wire the runtime YAML path. If the file doesn't exist yet, seed it from the
 * bundled baseline so the user always has something to edit. Subsequent calls
 * just reload from disk.
 */
export function setInstrumentsPath(path: string): void {
  storePath = path;
  if (!existsSync(path)) {
    try {
      writeFileSync(path, BASELINE_YAML, 'utf-8');
    } catch {
      /* read-only fs in tests — fall back to in-memory baseline */
    }
  }
  reloadInstruments();
}

export function reloadInstruments(): void {
  if (storePath && existsSync(storePath)) {
    try {
      const text = readFileSync(storePath, 'utf-8');
      INSTRUMENTS = parseYaml(text);
      rebuildIndices();
      return;
    } catch {
      /* fall through to baseline */
    }
  }
  INSTRUMENTS = parseYaml(BASELINE_YAML);
  rebuildIndices();
}

export function instrumentsMtime(): number {
  if (!storePath || !existsSync(storePath)) return 0;
  try {
    return statSync(storePath).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Persist the current `INSTRUMENTS[]` to disk and rebuild indices.
 * The YAML is written with stable, human-readable formatting; comments from
 * the bundled baseline are not preserved across rewrites (acceptable: once
 * the user starts editing via the UI, the runtime YAML becomes the source
 * of truth and lives outside version control under `/data`).
 */
function persist(): void {
  if (!storePath) {
    throw new Error('Instruments store path not configured');
  }
  const text = yaml.dump(INSTRUMENTS, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  writeFileSync(storePath, text, 'utf-8');
  rebuildIndices();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function uniqueId(base: string): string {
  const seed = slug(base) || 'instrument';
  if (!ID_INDEX.has(seed)) return seed;
  let i = 2;
  while (ID_INDEX.has(`${seed}-${i}`)) i++;
  return `${seed}-${i}`;
}

export interface UpsertResolvedInput {
  instrumentId: string;
  /** Pass `null` or empty string to clear the priceSource entirely. */
  yahooSymbol: string | null;
}

/**
 * Update the Yahoo `priceSource` for an existing instrument, or clear it.
 * Returns the updated instrument.
 */
export function upsertResolvedMapping(input: UpsertResolvedInput): Instrument {
  const inst = ID_INDEX.get(input.instrumentId);
  if (!inst) throw new Error(`Unknown instrument id: ${input.instrumentId}`);

  const symbol = (input.yahooSymbol ?? '').trim();
  if (!symbol) {
    delete inst.priceSource;
  } else {
    inst.priceSource = { provider: 'yahoo', symbol };
  }
  persist();
  return inst;
}

export interface PromoteUnresolvedInput {
  broker: BrokerKey;
  rawSymbol: string;
  yahooSymbol: string;
  /** Optional metadata. If omitted we fall back to sensible defaults (Yahoo
   * verify response on the API side typically supplies these). */
  name?: string;
  currency?: string;
  assetClass?: AssetClass;
  isin?: string;
}

/**
 * Promote an unresolved (broker, rawSymbol) pair into a brand-new instrument
 * with the supplied Yahoo ticker. Returns the freshly created instrument.
 */
export function promoteUnresolvedMapping(input: PromoteUnresolvedInput): Instrument {
  const ticker = input.yahooSymbol.trim();
  if (!ticker) throw new Error('yahooSymbol is required');

  const id = uniqueId(input.rawSymbol || ticker);
  const aliases: Instrument['aliases'] = {
    [input.broker]: input.rawSymbol,
  };

  const inst: Instrument = {
    id,
    name: input.name?.trim() || input.rawSymbol || ticker,
    isin: input.isin,
    currency: (input.currency || 'USD').toUpperCase(),
    assetClass: input.assetClass ?? 'equity',
    priceSource: { provider: 'yahoo', symbol: ticker },
    aliases,
  };

  INSTRUMENTS.push(inst);
  persist();
  return inst;
}

/**
 * Attach an unresolved (broker, rawSymbol) as an additional alias of an
 * existing instrument. Used when the user picks an existing canonical id
 * instead of creating a new one. (Reserved for future UI; today the tab
 * only does ticker-only edits, but the helper is cheap to keep.)
 */
export function attachAliasToInstrument(
  instrumentId: string,
  broker: BrokerKey,
  rawSymbol: string,
): Instrument {
  const inst = ID_INDEX.get(instrumentId);
  if (!inst) throw new Error(`Unknown instrument id: ${instrumentId}`);

  const current = inst.aliases?.[broker];
  const list = Array.isArray(current) ? [...current] : current ? [current] : [];
  const symbol = rawSymbol.trim();
  if (symbol && !list.includes(symbol)) list.push(symbol);
  inst.aliases = { ...inst.aliases, [broker]: list.length === 1 ? list[0] : list };
  persist();
  return inst;
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

/** Re-export so callers don't need to dig into types just for the union. */
export type { PriceSource };
