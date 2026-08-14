import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { AssetClass, Broker } from '../shared/types';
import { BROKER_KEYS } from '../shared/brokers';
import { PortfolioService } from '../core/portfolio';
import { WatchlistStore } from '../core/watchlist';
import { buildResearchFeed } from '../core/research';
import { FundamentalsService } from '../market/fundamentals';
import { verifyYahooSymbol } from '../market/prices';
import { resolveSafeDataPath, walkDataDir } from './files';

function findAsset(dir: string, base: string, ext: string): string {
  const files = readdirSync(dir);
  const match = files.find(
    f => f.startsWith(`${base}-`) && f.endsWith(`.${ext}`) && !f.endsWith(`.${ext}.map`),
  );
  return match || `${base}.${ext}`;
}

export function createServer(options: { port: number; dataDir: string }) {
  const app = Fastify({ logger: true });
  app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  const appDir = resolve(process.env.APP_DIR || '/app');
  const publicDir = join(appDir, 'public');
  mkdirSync(join(options.dataDir, 'Investments'), { recursive: true });

  const appJs = findAsset(publicDir, 'app', 'js');
  const appCss = findAsset(publicDir, 'app', 'css');

  const portfolio = new PortfolioService(options.dataDir);
  const watchlist = new WatchlistStore(options.dataDir);
  const fundamentals = new FundamentalsService(options.dataDir);

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

  // -------------------------------------------------------------------------
  // Portfolio
  // -------------------------------------------------------------------------

  app.get('/api/portfolio', async () => {
    return portfolio.getPortfolio();
  });

  app.post('/api/portfolio/refresh', async () => {
    const result = await portfolio.getPortfolio(true);
    return { ok: true, asOf: result.asOf };
  });

  app.get('/api/transactions', async () => {
    return portfolio.getTransactions();
  });

  // -------------------------------------------------------------------------
  // Instruments
  // -------------------------------------------------------------------------

  app.get('/api/instruments', async () => {
    return portfolio.instruments.all();
  });

  app.get('/api/instruments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = await portfolio.getInstrumentDetail(id);
    if (!detail) return reply.code(404).send({ error: 'Unknown instrument' });
    return detail;
  });

  app.patch('/api/instruments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      symbol?: string;
      name?: string;
      assetClass?: AssetClass;
      yahooSymbol?: string | null;
    };
    try {
      const instrument = portfolio.instruments.update(id, body);
      portfolio.invalidate();
      await portfolio.getPortfolio();
      return { ok: true, instrument };
    } catch (e: any) {
      return reply.code(400).send({ ok: false, error: e?.message || 'Save failed' });
    }
  });

  app.post('/api/instruments', async (request, reply) => {
    const body = (request.body ?? {}) as {
      broker?: string;
      rawSymbol?: string;
      yahooSymbol?: string;
      name?: string;
      currency?: string;
    };
    const broker = String(body.broker ?? '') as Broker;
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
    // Probe Yahoo so the new instrument inherits the right currency / name.
    // Verify failures are tolerated (bad network shouldn't strand the user).
    let verified: Awaited<ReturnType<typeof verifyYahooSymbol>> | null = null;
    try {
      verified = await verifyYahooSymbol(yahooSymbol);
    } catch {
      verified = null;
    }
    try {
      const instrument = portfolio.instruments.create({
        broker,
        rawSymbol,
        yahooSymbol,
        name: body.name?.trim() || verified?.longName || verified?.shortName || rawSymbol,
        currency: (body.currency || verified?.currency || 'USD').toUpperCase(),
      });
      portfolio.invalidate();
      await portfolio.getPortfolio();
      return { ok: true, instrument };
    } catch (e: any) {
      return reply.code(400).send({ ok: false, error: e?.message || 'Save failed' });
    }
  });

  app.post('/api/yahoo/verify', async (request, reply) => {
    const body = (request.body ?? {}) as { symbol?: string };
    const symbol = String(body.symbol ?? '').trim();
    if (!symbol) {
      return reply.code(400).send({ ok: false, error: 'symbol is required' });
    }
    try {
      const result = await verifyYahooSymbol(symbol);
      if (!result) return reply.code(404).send({ ok: false, error: 'No quote found' });
      return { ok: true, ...result };
    } catch (e: any) {
      return reply.code(502).send({ ok: false, error: e?.message || 'Yahoo error' });
    }
  });

  // -------------------------------------------------------------------------
  // Watchlist + research
  // -------------------------------------------------------------------------

  app.get('/api/watchlist', async () => {
    return { items: watchlist.list() };
  });

  app.post('/api/watchlist', async (request, reply) => {
    const body = (request.body ?? {}) as {
      symbol?: string;
      displayName?: string | null;
      notes?: string | null;
    };
    const symbol = String(body.symbol ?? '').trim();
    if (!symbol) {
      return reply.code(400).send({ ok: false, error: 'symbol is required' });
    }
    try {
      // Probe Yahoo so the saved row carries a display name out of the box.
      let displayName = body.displayName?.trim() || null;
      if (!displayName) {
        try {
          const verified = await verifyYahooSymbol(symbol);
          displayName = verified?.longName ?? verified?.shortName ?? null;
        } catch {
          /* symbol is still saved */
        }
      }
      const item = watchlist.add({ symbol, displayName, notes: body.notes ?? null });
      return { ok: true, item };
    } catch (e: any) {
      return reply.code(400).send({ ok: false, error: e?.message || 'Save failed' });
    }
  });

  app.patch('/api/watchlist/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      symbol?: string;
      displayName?: string | null;
      notes?: string | null;
    };
    try {
      const item = watchlist.update(id, body);
      return { ok: true, item };
    } catch (e: any) {
      return reply.code(404).send({ ok: false, error: e?.message || 'Not found' });
    }
  });

  app.delete('/api/watchlist/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = watchlist.remove(id);
    if (!ok) return reply.code(404).send({ ok: false, error: 'Not found' });
    return { ok: true };
  });

  app.get('/api/research', async () => {
    return buildResearchFeed(portfolio, watchlist, portfolio.prices, fundamentals);
  });

  app.post('/api/research/refresh', async () => {
    // Hard refresh — wipe the fundamentals cache so the next fetch pulls
    // everything fresh from Yahoo.
    fundamentals.invalidateAll();
    const payload = await buildResearchFeed(portfolio, watchlist, portfolio.prices, fundamentals);
    return { ok: true, asOf: payload.asOf };
  });

  // -------------------------------------------------------------------------
  // Files — one generic API over the whole data dir. Broker uploads are just
  // `POST /api/files/upload?dir=Investments/<broker>`.
  // -------------------------------------------------------------------------

  app.get('/api/files', async () => {
    const files = await walkDataDir(options.dataDir);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { files };
  });

  app.get('/api/files/download', async (request, reply) => {
    const path = String((request.query as any)?.path ?? '');
    const abs = resolveSafeDataPath(options.dataDir, path);
    if (!abs || abs === options.dataDir) {
      return reply.code(400).send({ error: 'Invalid path' });
    }
    if (!existsSync(abs)) return reply.code(404).send({ error: 'Not found' });
    const stat = statSync(abs);
    if (!stat.isFile()) return reply.code(400).send({ error: 'Not a file' });
    const filename = basename(abs);
    reply.header('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    reply.header('Content-Length', String(stat.size));
    reply.type('application/octet-stream');
    return reply.send(createReadStream(abs));
  });

  app.delete('/api/files', async (request, reply) => {
    const path = String((request.query as any)?.path ?? '');
    const abs = resolveSafeDataPath(options.dataDir, path);
    if (!abs || abs === options.dataDir) {
      return reply.code(400).send({ ok: false, error: 'Invalid path' });
    }
    if (!existsSync(abs)) {
      return reply.code(404).send({ ok: false, error: 'Not found' });
    }
    if (!statSync(abs).isFile()) {
      return reply.code(400).send({ ok: false, error: 'Not a file' });
    }
    unlinkSync(abs);
    return { ok: true };
  });

  app.post('/api/files/upload', async (request, reply) => {
    const dirParam = String((request.query as any)?.dir ?? '');
    const targetDir = resolveSafeDataPath(options.dataDir, dirParam);
    if (!targetDir) {
      return reply.code(400).send({ ok: false, error: 'Invalid dir' });
    }
    mkdirSync(targetDir, { recursive: true });
    const parts = request.parts();
    const uploaded: string[] = [];
    for await (const part of parts) {
      if (part.type === 'file') {
        const safeName = basename(part.filename);
        const targetPath = join(targetDir, safeName);
        await pipeline(part.file, createWriteStream(targetPath));
        uploaded.push(relative(options.dataDir, targetPath).split(sep).join('/'));
      }
    }
    return { ok: true, uploaded };
  });

  app.listen({ port: options.port, host: '0.0.0.0' });
  return app;
}
