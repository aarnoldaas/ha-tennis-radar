import { BASE } from './utils';
import type {
  Broker,
  DataFilesPayload,
  Instrument,
  InstrumentDetail,
  Portfolio,
  ResearchPayload,
  Transaction,
  WatchlistItem,
  YahooVerifyResult,
} from '../../shared/types';

/**
 * Thin fetch wrappers around the addon API. All payload shapes come from
 * `shared/types.ts` — this file declares no types of its own.
 */

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  portfolio: () => fetch(`${BASE}/api/portfolio`).then(r => j<Portfolio>(r)),
  refresh: () =>
    fetch(`${BASE}/api/portfolio/refresh`, { method: 'POST' }).then(r =>
      j<{ ok: boolean; asOf: string }>(r),
    ),
  transactions: () => fetch(`${BASE}/api/transactions`).then(r => j<Transaction[]>(r)),

  instruments: () => fetch(`${BASE}/api/instruments`).then(r => j<Instrument[]>(r)),
  instrument: (id: string) =>
    fetch(`${BASE}/api/instruments/${encodeURIComponent(id)}`).then(r =>
      j<InstrumentDetail>(r),
    ),
  updateInstrument: async (
    id: string,
    patch: { symbol?: string; name?: string; assetClass?: string; yahooSymbol?: string | null },
  ) => {
    const res = await fetch(`${BASE}/api/instruments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return (await res.json()) as { ok: boolean; error?: string; instrument?: Instrument };
  },
  createInstrument: async (input: {
    broker: Broker;
    rawSymbol: string;
    yahooSymbol: string;
    name?: string;
    currency?: string;
  }) => {
    const res = await fetch(`${BASE}/api/instruments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return (await res.json()) as { ok: boolean; error?: string; instrument?: Instrument };
  },
  verifyYahoo: async (symbol: string) => {
    const res = await fetch(`${BASE}/api/yahoo/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    // Errors come back as 4xx/5xx with a structured body — surface them
    // instead of throwing so the UI can render the message inline.
    return (await res.json()) as YahooVerifyResult;
  },

  research: () => fetch(`${BASE}/api/research`).then(r => j<ResearchPayload>(r)),
  refreshResearch: () =>
    fetch(`${BASE}/api/research/refresh`, { method: 'POST' }).then(r =>
      j<{ ok: boolean; asOf: string }>(r),
    ),
  addWatchlist: async (input: {
    symbol: string;
    displayName?: string | null;
    notes?: string | null;
  }) => {
    const res = await fetch(`${BASE}/api/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return (await res.json()) as { ok: boolean; error?: string; item?: WatchlistItem };
  },
  updateWatchlist: async (
    id: string,
    patch: { symbol?: string; displayName?: string | null; notes?: string | null },
  ) => {
    const res = await fetch(`${BASE}/api/watchlist/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return (await res.json()) as { ok: boolean; error?: string; item?: WatchlistItem };
  },
  removeWatchlist: async (id: string) => {
    const res = await fetch(`${BASE}/api/watchlist/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return (await res.json()) as { ok: boolean; error?: string };
  },

  listFiles: () => fetch(`${BASE}/api/files`).then(r => j<DataFilesPayload>(r)),
  fileDownloadUrl: (path: string) =>
    `${BASE}/api/files/download?path=${encodeURIComponent(path)}`,
  deleteFile: async (path: string) => {
    const res = await fetch(`${BASE}/api/files?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    return j<{ ok: boolean; error?: string }>(res);
  },
  uploadFiles: async (dir: string, files: File[]) => {
    const formData = new FormData();
    for (const f of files) formData.append('file', f, f.name);
    const res = await fetch(`${BASE}/api/files/upload?dir=${encodeURIComponent(dir)}`, {
      method: 'POST',
      body: formData,
    });
    return j<{ ok: boolean; uploaded?: string[]; error?: string }>(res);
  },
};
