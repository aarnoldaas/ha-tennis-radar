import { createHash } from 'node:crypto';

/** Short stable hash used for dedupe ids of rows without a broker reference number. */
export function stableHash(...parts: Array<string | number | undefined | null>): string {
  const h = createHash('sha1');
  for (const p of parts) h.update(String(p ?? '') + '|');
  return h.digest('hex').slice(0, 16);
}
