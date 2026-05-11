import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync, createReadStream } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { join, resolve, relative, sep, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { PortfolioService } from './portfolio/service.js';
import {
  promoteUnresolvedMapping,
  upsertResolvedMapping,
} from './config/instruments.js';
import { verifyYahooSymbol } from './market/prices.js';
import type { BrokerKey } from './parsers/types.js';
import { BROKER_KEYS } from './parsers/types.js';

const BROKER_DIRS: Record<string, string> = {
  swedbank: 'swedbank',
  'interactive-brokers': 'interactive-brokers',
};

function findAsset(dir: string, base: string, ext: string): string {
  const files = readdirSync(dir);
  const match = files.find(f => f.startsWith(`${base}-`) && f.endsWith(`.${ext}`) && !f.endsWith(`.${ext}.map`));
  return match || `${base}.${ext}`;
}

// Normalise a user-supplied relative path and ensure it stays inside dataDir.
// Returns the resolved absolute path or null if the request escapes dataDir.
function resolveSafeDataPath(dataDir: string, requested: string): string | null {
  if (typeof requested !== 'string') return null;
  const cleaned = requested.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!cleaned) return dataDir;
  const abs = resolve(dataDir, cleaned);
  const rel = relative(dataDir, abs);
  if (rel === '' ) return abs;
  if (rel.startsWith('..') || rel.split(sep).includes('..')) return null;
  return abs;
}

interface DataFileEntry {
  path: string;
  size: number;
  mtime: number;
}

async function walkDataDir(root: string, current: string, out: DataFileEntry[]): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fsp.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) {
      await walkDataDir(root, full, out);
    } else if (entry.isFile()) {
      try {
        const stat = await fsp.stat(full);
        out.push({
          path: relative(root, full).split(sep).join('/'),
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      } catch {
        // ignore unreadable entries
      }
    }
  }
}

export function createServer(options: { port: number; dataDir: string }) {
  const app = Fastify({ logger: true });
  app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  const appDir = resolve(process.env.APP_DIR || '/app');
  const publicDir = join(appDir, 'public');
  const investmentsDir = join(options.dataDir, 'Investments');
  mkdirSync(investmentsDir, { recursive: true });

  const appJs = findAsset(publicDir, 'app', 'js');
  const appCss = findAsset(publicDir, 'app', 'css');

  const portfolio = new PortfolioService(options.dataDir);

  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    reply.header('Surrogate-Control', 'no-store');
  });

  app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/static/',
    decorateReply: true,
    cacheControl: false,
    etag: false,
    lastModified: false,
  });

  const serveIndex = async (request: any, reply: any) => {
    const ingressPath = (request.headers['x-ingress-path'] as string) || '';
    const html = readFileSync(join(publicDir, 'index.html'), 'utf-8')
      .replace(/\{\{INGRESS_PATH\}\}/g, ingressPath)
      .replace(/\{\{APP_JS\}\}/g, appJs)
      .replace(/\{\{APP_CSS\}\}/g, appCss);
    reply.type('text/html').send(html);
  };
  app.get('/', serveIndex);
  app.get('//', serveIndex);

  app.get('/api/investments/files', async () => {
    const result: Record<string, string[]> = {};
    for (const [key, dir] of Object.entries(BROKER_DIRS)) {
      const fullPath = join(investmentsDir, dir);
      if (existsSync(fullPath)) {
        result[key] = readdirSync(fullPath).filter(f => {
          const stat = statSync(join(fullPath, f));
          return stat.isFile();
        });
      } else {
        result[key] = [];
      }
    }
    return result;
  });

  app.post('/api/investments/upload', async (request) => {
    const parts = request.parts();
    const uploaded: string[] = [];

    for await (const part of parts) {
      if (part.type === 'file') {
        const broker = part.fieldname;
        const brokerDir = BROKER_DIRS[broker];
        if (!brokerDir) continue;

        const targetDir = join(investmentsDir, brokerDir);
        mkdirSync(targetDir, { recursive: true });

        const targetPath = join(targetDir, part.filename);
        await pipeline(part.file, createWriteStream(targetPath));
        uploaded.push(`${broker}/${part.filename}`);
      }
    }

    return { success: true, uploaded };
  });

  app.delete('/api/investments/files/:broker/:filename', async (request) => {
    const { broker, filename } = request.params as { broker: string; filename: string };
    const brokerDir = BROKER_DIRS[broker];
    if (!brokerDir) return { success: false, error: 'Unknown broker' };

    const filePath = join(investmentsDir, brokerDir, filename);
    if (!existsSync(filePath)) return { success: false, error: 'File not found' };

    unlinkSync(filePath);
    return { success: true };
  });

  // Generic /data file manager.
  // Lists, downloads, deletes, and uploads any file under the addon's data
  // directory — broker CSVs under Investments/, the runtime instrument
  // master, derived caches, stray exports, etc. All paths are resolved
  // relative to dataDir and validated against escape attempts.

  app.get('/api/data/files', async () => {
    const out: DataFileEntry[] = [];
    await walkDataDir(options.dataDir, options.dataDir, out);
    out.sort((a, b) => a.path.localeCompare(b.path));
    return { root: options.dataDir, files: out };
  });

  app.get('/api/data/file', async (request, reply) => {
    const path = String((request.query as any)?.path ?? '');
    const abs = resolveSafeDataPath(options.dataDir, path);
    if (!abs || abs === options.dataDir) {
      return reply.code(400).send({ error: 'Invalid path' });
    }
    if (!existsSync(abs)) return reply.code(404).send({ error: 'Not found' });
    const stat = statSync(abs);
    if (!stat.isFile()) return reply.code(400).send({ error: 'Not a file' });
    const filename = basename(abs);
    reply.header(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/"/g, '')}"`,
    );
    reply.header('Content-Length', String(stat.size));
    reply.type('application/octet-stream');
    return reply.send(createReadStream(abs));
  });

  app.delete('/api/data/file', async (request, reply) => {
    const path = String((request.query as any)?.path ?? '');
    const abs = resolveSafeDataPath(options.dataDir, path);
    if (!abs || abs === options.dataDir) {
      return reply.code(400).send({ success: false, error: 'Invalid path' });
    }
    if (!existsSync(abs)) {
      return reply.code(404).send({ success: false, error: 'Not found' });
    }
    const stat = statSync(abs);
    if (!stat.isFile()) {
      return reply.code(400).send({ success: false, error: 'Not a file' });
    }
    unlinkSync(abs);
    return { success: true };
  });

  app.post('/api/data/upload', async (request, reply) => {
    const dirParam = String((request.query as any)?.dir ?? '');
    const targetDir = resolveSafeDataPath(options.dataDir, dirParam);
    if (!targetDir) {
      return reply.code(400).send({ success: false, error: 'Invalid dir' });
    }
    mkdirSync(targetDir, { recursive: true });
    const parts = request.parts();
    const uploaded: string[] = [];
    for await (const part of parts) {
      if (part.type === 'file') {
        const safeName = basename(part.filename);
        const targetPath = join(targetDir, safeName);
        await pipeline(part.file, createWriteStream(targetPath));
        uploaded.push(
          relative(options.dataDir, targetPath).split(sep).join('/'),
        );
      }
    }
    return { success: true, uploaded };
  });

  app.get('/api/portfolio', async () => {
    return portfolio.getSnapshot();
  });

  app.post('/api/portfolio/refresh', async () => {
    const snapshot = await portfolio.getSnapshot(true);
    return { success: true, asOf: snapshot.asOf };
  });

  app.get('/api/portfolio/instrument/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = await portfolio.getInstrumentDetail(id);
    if (!detail) return reply.code(404).send({ error: 'Unknown instrument' });
    return detail;
  });

  app.get('/api/portfolio/transactions', async () => {
    return portfolio.getTransactions();
  });

  app.get('/api/instruments', async () => {
    return portfolio.listInstruments();
  });

  app.get('/api/instruments/unresolved', async () => {
    const snap = await portfolio.getSnapshot();
    return snap.unresolved;
  });

  app.get('/api/instruments/mappings', async () => {
    return portfolio.getMappings();
  });

  app.post('/api/instruments/verify', async (request, reply) => {
    const body = (request.body ?? {}) as { symbol?: string };
    const symbol = String(body.symbol ?? '').trim();
    if (!symbol) {
      return reply.code(400).send({ ok: false, error: 'symbol is required' });
    }
    try {
      const result = await verifyYahooSymbol(symbol);
      if (!result) {
        return reply.code(404).send({ ok: false, error: 'No quote found' });
      }
      return { ok: true, ...result };
    } catch (e: any) {
      return reply.code(502).send({ ok: false, error: e?.message || 'Yahoo error' });
    }
  });

  app.post('/api/instruments/mappings/resolved', async (request, reply) => {
    const body = (request.body ?? {}) as {
      instrumentId?: string;
      yahooSymbol?: string | null;
    };
    const instrumentId = String(body.instrumentId ?? '').trim();
    if (!instrumentId) {
      return reply.code(400).send({ ok: false, error: 'instrumentId is required' });
    }
    const yahooSymbol =
      body.yahooSymbol == null ? null : String(body.yahooSymbol).trim();
    try {
      const inst = upsertResolvedMapping({
        instrumentId,
        yahooSymbol: yahooSymbol === '' ? null : yahooSymbol,
      });
      // Force a rebuild so Holdings reflects the new ticker immediately.
      await portfolio.getSnapshot(true);
      return { ok: true, instrument: inst };
    } catch (e: any) {
      return reply.code(400).send({ ok: false, error: e?.message || 'Save failed' });
    }
  });

  app.post('/api/instruments/mappings/unresolved', async (request, reply) => {
    const body = (request.body ?? {}) as {
      broker?: string;
      rawSymbol?: string;
      yahooSymbol?: string;
      name?: string;
      currency?: string;
    };
    const broker = String(body.broker ?? '') as BrokerKey;
    const rawSymbol = String(body.rawSymbol ?? '').trim();
    const yahooSymbol = String(body.yahooSymbol ?? '').trim();
    if (!BROKER_KEYS.includes(broker)) {
      return reply.code(400).send({ ok: false, error: 'Unknown broker' });
    }
    if (!rawSymbol) {
      return reply.code(400).send({ ok: false, error: 'rawSymbol is required' });
    }
    if (!yahooSymbol) {
      return reply.code(400).send({ ok: false, error: 'yahooSymbol is required' });
    }
    // Probe Yahoo so the new instrument inherits the correct currency / name.
    // If verify fails we still allow saving (using sensible fallbacks) so a
    // bad network or off-hours flake doesn't strand the user — they can
    // re-verify later.
    let verified: Awaited<ReturnType<typeof verifyYahooSymbol>> | null = null;
    try {
      verified = await verifyYahooSymbol(yahooSymbol);
    } catch {
      verified = null;
    }
    try {
      const inst = promoteUnresolvedMapping({
        broker,
        rawSymbol,
        yahooSymbol,
        name: body.name?.trim() || verified?.longName || verified?.shortName || rawSymbol,
        currency: (body.currency || verified?.currency || 'USD').toUpperCase(),
        assetClass: 'equity',
      });
      await portfolio.getSnapshot(true);
      return { ok: true, instrument: inst, verified };
    } catch (e: any) {
      return reply.code(400).send({ ok: false, error: e?.message || 'Save failed' });
    }
  });

  app.listen({ port: options.port, host: '0.0.0.0' });
  return app;
}
