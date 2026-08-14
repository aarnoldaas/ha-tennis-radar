import { promises as fsp } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { DataFileEntry } from '../shared/types';

/**
 * Normalise a user-supplied relative path and ensure it stays inside
 * `dataDir`. Returns the resolved absolute path, or null if the request
 * escapes the data directory.
 */
export function resolveSafeDataPath(dataDir: string, requested: string): string | null {
  if (typeof requested !== 'string') return null;
  const cleaned = requested.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!cleaned) return dataDir;
  const abs = resolve(dataDir, cleaned);
  const rel = relative(dataDir, abs);
  if (rel === '') return abs;
  if (rel.startsWith('..') || rel.split(sep).includes('..')) return null;
  return abs;
}

/** Recursively list every file under `root`, paths relative and /-separated. */
export async function walkDataDir(root: string, current = root): Promise<DataFileEntry[]> {
  const out: DataFileEntry[] = [];
  let entries;
  try {
    entries = await fsp.readdir(current, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkDataDir(root, full)));
    } else if (entry.isFile()) {
      try {
        const stat = await fsp.stat(full);
        out.push({
          path: relative(root, full).split(sep).join('/'),
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      } catch {
        /* ignore unreadable entries */
      }
    }
  }
  return out;
}
