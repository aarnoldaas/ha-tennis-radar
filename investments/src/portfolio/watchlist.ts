import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Watchlist storage. Independent of the curated instrument master so
 * watchlist items don't pollute portfolio derivations (Holdings,
 * Allocation, etc.). Backed by `/data/watchlist.json`. One source of
 * truth, hand-edited via the Watchlist tab UI.
 *
 * A watchlist item is identified by `symbol` (Yahoo Finance format —
 * e.g. `AAPL`, `NOVO-B.CO`, `IGN1L.VS`). Notes are free-text user
 * annotation.
 *
 * Older versions of this addon (1.55.0 - 1.55.2) stored items keyed by
 * `finnhubSymbol` with an optional `yahooSymbol` fallback. On load we
 * migrate those into the new shape in memory and write back on the next
 * mutation so users don't lose their watchlist when upgrading.
 */

export interface WatchlistItem {
  id: string;
  /** Yahoo Finance symbol (the canonical key after the Finnhub removal in 1.56.0). */
  symbol: string;
  displayName: string | null;
  notes: string | null;
  addedAt: string;
}

interface WatchlistFile {
  items: WatchlistItem[];
}

export interface WatchlistUpsertInput {
  symbol: string;
  displayName?: string | null;
  notes?: string | null;
}

export class WatchlistStore {
  private readonly path: string;
  private file: WatchlistFile;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'watchlist.json');
    this.file = existsSync(this.path)
      ? safeParse(readFileSync(this.path, 'utf-8'))
      : { items: [] };
  }

  list(): WatchlistItem[] {
    return [...this.file.items].sort((a, b) =>
      (a.displayName ?? a.symbol).localeCompare(b.displayName ?? b.symbol),
    );
  }

  add(input: WatchlistUpsertInput): WatchlistItem {
    const symbol = input.symbol.trim();
    if (!symbol) throw new Error('symbol is required');
    const norm = symbol.toUpperCase();
    const existing = this.file.items.find(i => i.symbol.toUpperCase() === norm);
    if (existing) {
      // Idempotent add — update optional fields if provided so the user
      // can re-submit the same symbol with fresh notes without
      // duplicating.
      return this.update(existing.id, input);
    }
    const item: WatchlistItem = {
      id: randomUUID(),
      symbol,
      displayName: (input.displayName ?? null)?.trim() || null,
      notes: (input.notes ?? null)?.trim() || null,
      addedAt: new Date().toISOString(),
    };
    this.file.items.push(item);
    this.save();
    return item;
  }

  update(id: string, patch: Partial<WatchlistUpsertInput>): WatchlistItem {
    const item = this.file.items.find(i => i.id === id);
    if (!item) throw new Error('Watchlist item not found');
    if (patch.symbol !== undefined) {
      const next = patch.symbol.trim();
      if (!next) throw new Error('symbol cannot be empty');
      item.symbol = next;
    }
    if (patch.displayName !== undefined) {
      const next = (patch.displayName ?? '').trim();
      item.displayName = next || null;
    }
    if (patch.notes !== undefined) {
      const next = (patch.notes ?? '').trim();
      item.notes = next || null;
    }
    this.save();
    return item;
  }

  remove(id: string): boolean {
    const before = this.file.items.length;
    this.file.items = this.file.items.filter(i => i.id !== id);
    if (this.file.items.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  private save(): void {
    writeFileSync(this.path, JSON.stringify(this.file, null, 2));
  }
}

function safeParse(text: string): WatchlistFile {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      return { items: [] };
    }
    // Migrate legacy items (1.55.0 - 1.55.2) that were keyed by
    // `finnhubSymbol`. Prefer `yahooSymbol` when both are present since
    // it's more likely to resolve cleanly against Yahoo's quoteSummary.
    const migrated: WatchlistItem[] = (parsed.items as any[])
      .map((raw: any) => {
        if (typeof raw?.symbol === 'string') {
          return raw as WatchlistItem;
        }
        const legacySymbol =
          (typeof raw?.yahooSymbol === 'string' && raw.yahooSymbol.trim()) ||
          (typeof raw?.finnhubSymbol === 'string' && raw.finnhubSymbol.trim()) ||
          '';
        if (!legacySymbol) return null;
        return {
          id: typeof raw.id === 'string' ? raw.id : randomUUID(),
          symbol: legacySymbol,
          displayName:
            typeof raw.displayName === 'string' && raw.displayName.trim()
              ? raw.displayName.trim()
              : null,
          notes:
            typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : null,
          addedAt:
            typeof raw.addedAt === 'string' ? raw.addedAt : new Date().toISOString(),
        };
      })
      .filter((x): x is WatchlistItem => x !== null);
    return { items: migrated };
  } catch {
    return { items: [] };
  }
}
