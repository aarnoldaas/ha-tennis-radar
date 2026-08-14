import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import yaml from 'js-yaml';
import type { AssetClass, Broker, Instrument } from '../shared/types';
import { BROKER_KEYS } from '../shared/brokers';
import bundledBaselineYaml from '../config/instruments.yaml';

/**
 * Runtime instrument master.
 *
 * The repository ships a curated baseline (`config/instruments.yaml`, inlined
 * into the bundle via esbuild's text loader). On first boot the baseline is
 * copied to `<dataDir>/instruments.yaml`; thereafter the runtime file is the
 * source of truth and the Instruments tab rewrites it.
 *
 * Loading tolerates the pre-2.0 format (`priceSource: {provider, symbol}`,
 * `string | string[]` aliases, no `symbol` field) and migrates it in place:
 * the file is rewritten in the new shape once, ids preserved.
 */

const BASELINE_YAML: string = (bundledBaselineYaml as unknown as string) ?? '';

interface RawYamlEntry {
  id?: string;
  symbol?: string;
  name?: string;
  isin?: string | null;
  currency?: string;
  assetClass?: string;
  yahooSymbol?: string | null;
  priceSource?: { provider?: string; symbol?: string } | null;
  aliases?: Partial<Record<Broker, string | string[]>>;
}

function normalizeEntry(raw: RawYamlEntry): { instrument: Instrument; migrated: boolean } | null {
  if (!raw?.id) return null;
  let migrated = false;

  const aliases: Instrument['aliases'] = {};
  for (const broker of BROKER_KEYS) {
    const val = raw.aliases?.[broker];
    if (val == null) continue;
    if (typeof val === 'string') {
      aliases[broker] = [val];
      migrated = true;
    } else {
      aliases[broker] = [...val];
    }
  }

  let yahooSymbol = raw.yahooSymbol ?? null;
  if (yahooSymbol == null && raw.priceSource) {
    migrated = true;
    if (raw.priceSource.provider === 'yahoo' && raw.priceSource.symbol) {
      yahooSymbol = raw.priceSource.symbol;
    }
  }
  if ('priceSource' in raw) migrated = true;

  let symbol = raw.symbol ?? null;
  if (!symbol) {
    migrated = true;
    symbol =
      aliases.swedbank?.[0] ??
      aliases['interactive-brokers']?.[0] ??
      raw.id.toUpperCase();
  }

  const knownClasses: AssetClass[] = ['equity', 'etf', 'bond', 'crypto'];
  const assetClass = knownClasses.includes(raw.assetClass as AssetClass)
    ? (raw.assetClass as AssetClass)
    : 'equity';
  if (assetClass !== raw.assetClass) migrated = true;

  if (raw.isin === undefined) migrated = true;

  return {
    instrument: {
      id: raw.id,
      symbol,
      name: raw.name ?? symbol,
      isin: raw.isin ?? null,
      currency: (raw.currency ?? 'EUR').toUpperCase(),
      assetClass,
      yahooSymbol,
      aliases,
    },
    migrated,
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export interface CreateInstrumentInput {
  broker: Broker;
  rawSymbol: string;
  yahooSymbol: string;
  name?: string;
  currency?: string;
  assetClass?: AssetClass;
  isin?: string | null;
}

export interface UpdateInstrumentInput {
  symbol?: string;
  name?: string;
  assetClass?: AssetClass;
  /** Empty string or null clears the Yahoo mapping. */
  yahooSymbol?: string | null;
}

export class InstrumentStore {
  private readonly path: string;
  private instruments: Instrument[] = [];
  private byId = new Map<string, Instrument>();
  private byIsin = new Map<string, string>();
  private byAlias = new Map<string, string>();

  constructor(path: string) {
    this.path = path;
    if (!existsSync(path)) {
      try {
        writeFileSync(path, BASELINE_YAML, 'utf-8');
      } catch {
        /* read-only fs — fall back to in-memory baseline */
      }
    }
    this.reload();
  }

  reload(): void {
    let text = BASELINE_YAML;
    if (existsSync(this.path)) {
      try {
        text = readFileSync(this.path, 'utf-8');
      } catch {
        /* fall back to baseline */
      }
    }
    let entries: RawYamlEntry[] = [];
    try {
      entries = (yaml.load(text) as RawYamlEntry[]) ?? [];
    } catch {
      entries = [];
    }
    let anyMigrated = false;
    this.instruments = [];
    for (const raw of entries) {
      const result = normalizeEntry(raw);
      if (!result) continue;
      this.instruments.push(result.instrument);
      if (result.migrated) anyMigrated = true;
    }
    this.rebuildIndices();
    // Rewrite pre-2.0 files in the new shape once so subsequent loads are clean.
    if (anyMigrated && existsSync(this.path)) {
      try {
        this.persist();
      } catch {
        /* non-fatal */
      }
    }
  }

  mtime(): number {
    try {
      return existsSync(this.path) ? statSync(this.path).mtimeMs : 0;
    } catch {
      return 0;
    }
  }

  all(): Instrument[] {
    return [...this.instruments];
  }

  get(id: string): Instrument | undefined {
    return this.byId.get(id);
  }

  /** ISIN match wins (robust across brokers); (broker, alias) is the fallback. */
  resolve(broker: Broker, rawSymbol: string | null, isin?: string | null): string | null {
    if (isin) {
      const hit = this.byIsin.get(isin.toUpperCase());
      if (hit) return hit;
    }
    if (!rawSymbol) return null;
    return this.byAlias.get(aliasKey(broker, rawSymbol)) ?? null;
  }

  update(id: string, patch: UpdateInstrumentInput): Instrument {
    const inst = this.byId.get(id);
    if (!inst) throw new Error(`Unknown instrument id: ${id}`);
    if (patch.symbol !== undefined) {
      const symbol = patch.symbol.trim();
      if (!symbol) throw new Error('symbol cannot be empty');
      inst.symbol = symbol;
    }
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error('name cannot be empty');
      inst.name = name;
    }
    if (patch.assetClass !== undefined) inst.assetClass = patch.assetClass;
    if (patch.yahooSymbol !== undefined) {
      const symbol = (patch.yahooSymbol ?? '').trim();
      inst.yahooSymbol = symbol || null;
    }
    this.persist();
    return inst;
  }

  /** Promote an unmapped (broker, rawSymbol) pair into a new instrument. */
  create(input: CreateInstrumentInput): Instrument {
    const rawSymbol = input.rawSymbol.trim();
    const yahooSymbol = input.yahooSymbol.trim();
    if (!rawSymbol) throw new Error('rawSymbol is required');
    if (!yahooSymbol) throw new Error('yahooSymbol is required');

    const inst: Instrument = {
      id: this.uniqueId(rawSymbol || yahooSymbol),
      symbol: rawSymbol.toUpperCase(),
      name: input.name?.trim() || rawSymbol,
      isin: input.isin ?? null,
      currency: (input.currency || 'USD').toUpperCase(),
      assetClass: input.assetClass ?? 'equity',
      yahooSymbol,
      aliases: { [input.broker]: [rawSymbol] },
    };
    this.instruments.push(inst);
    this.persist();
    return inst;
  }

  private uniqueId(base: string): string {
    const seed = slug(base) || 'instrument';
    if (!this.byId.has(seed)) return seed;
    let i = 2;
    while (this.byId.has(`${seed}-${i}`)) i++;
    return `${seed}-${i}`;
  }

  private rebuildIndices(): void {
    this.byId = new Map();
    this.byIsin = new Map();
    this.byAlias = new Map();
    for (const inst of this.instruments) {
      this.byId.set(inst.id, inst);
      if (inst.isin) this.byIsin.set(inst.isin.toUpperCase(), inst.id);
      for (const [broker, list] of Object.entries(inst.aliases)) {
        for (const alias of list ?? []) {
          if (alias) this.byAlias.set(aliasKey(broker as Broker, alias), inst.id);
        }
      }
    }
  }

  private persist(): void {
    const text = yaml.dump(this.instruments, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
    writeFileSync(this.path, text, 'utf-8');
    this.rebuildIndices();
  }
}

function aliasKey(broker: Broker, symbol: string): string {
  return `${broker}::${symbol.trim().toUpperCase()}`;
}
