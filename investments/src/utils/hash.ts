import { createHash } from 'node:crypto';

export function stableHash(...parts: Array<string | number | undefined | null>): string {
  const h = createHash('sha1');
  for (const p of parts) h.update(String(p ?? '') + '|');
  return h.digest('hex').slice(0, 16);
}
