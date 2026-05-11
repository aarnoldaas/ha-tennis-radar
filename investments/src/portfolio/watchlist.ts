import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Watchlist storage. Independent of the curated instrument master so
 * watchlist items don't pollute portfolio derivations (Holdings, Allocation,
 * etc.). Backed by `/data/watchlist.json`. One source of truth, hand-edited
 * via the Watchlist tab UI.
 *
 * A watchlist item is identified by `finnhubSymbol` (e.g. "AAPL",
 * "NOVO_B.CO"). `yahooSymbol` is optional and lets us reuse the existing
 * `PriceService` for symbols Finnhub's free tier doesn't cover well —
 * mostly European and Baltic names. Notes are free-text user annotation.
 */

export interface WatchlistItem {
  id: string;
  finnhubSymbol: string;
  yahooSymbol: string | null;
  displayName: string | null;
  notes: string | null;
  addedAt: string;
}

interface WatchlistFile {
  items: WatchlistItem[];
}

export interface WatchlistUpsertInput {
  finnhubSymbol: string;
  yahooSymbol?: string | null;
  displayName?: string | null;
  notes?: string | null;
}

export class WatchlistStore {
  private readonly path: string;
  private file: WatchlistFile;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'watchlist.json');
    this.file = existsSync(this.path) ? safeParse(readFileSync(this.path, 'utf-8')) : { items: [] };
  }

  list(): WatchlistItem[] {
    return [...this.file.items].sort((a, b) =>
      (a.displayName ?? a.finnhubSymbol).localeCompare(b.displayName ?? b.finnhubSymbol),
    );
  }

  add(input: WatchlistUpsertInput): WatchlistItem {
    const finnhubSymbol = input.finnhubSymbol.trim().toUpperCase();
    if (!finnhubSymbol) throw new Error('finnhubSymbol is required');
    const existing = this.file.items.find(i => i.finnhubSymbol === finnhubSymbol);
    if (existing) {
      // Idempotent add — update optional fields if provided so the user can
      // re-submit the same symbol with fresh notes without duplicating.
      return this.update(existing.id, input);
    }
    const item: WatchlistItem = {
      id: randomUUID(),
      finnhubSymbol,
      yahooSymbol: (input.yahooSymbol ?? null)?.trim() || null,
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
    if (patch.finnhubSymbol !== undefined) {
      const next = patch.finnhubSymbol.trim().toUpperCase();
      if (!next) throw new Error('finnhubSymbol cannot be empty');
      item.finnhubSymbol = next;
    }
    if (patch.yahooSymbol !== undefined) {
      const next = (patch.yahooSymbol ?? '').trim();
      item.yahooSymbol = next || null;
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
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
      return parsed as WatchlistFile;
    }
  } catch {
    // fall through
  }
  return { items: [] };
}
