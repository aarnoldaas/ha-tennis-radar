import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HomeListsStore } from './store';

function findAsset(dir: string, base: string, ext: string): string {
  return readdirSync(dir).find(file => file.startsWith(`${base}-`) && file.endsWith(`.${ext}`) && !file.endsWith(`.${ext}.map`)) || `${base}.${ext}`;
}

export function createServer(options: { port: number; dataDir: string }) {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
  const publicDir = join(resolve(process.env.APP_DIR || '/app'), 'public');
  const appJs = findAsset(publicDir, 'app', 'js');
  const appCss = findAsset(publicDir, 'app', 'css');
  const store = new HomeListsStore(options.dataDir);

  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    reply.header('Pragma', 'no-cache');
  });

  app.register(fastifyStatic, { root: publicDir, prefix: '/static/', cacheControl: false, etag: false, lastModified: false });

  const serveIndex = async (request: any, reply: any) => {
    const ingressPath = String(request.headers['x-ingress-path'] || '');
    const html = readFileSync(join(publicDir, 'index.html'), 'utf8')
      .replace(/\{\{INGRESS_PATH\}\}/g, ingressPath)
      .replace(/\{\{APP_JS\}\}/g, appJs)
      .replace(/\{\{APP_CSS\}\}/g, appCss);
    return reply.type('text/html').send(html);
  };
  app.get('/', serveIndex);
  app.get('//', serveIndex);

  app.get('/api/health', async () => ({ ok: true, version: process.env.BUILD_VERSION || 'dev' }));
  app.get('/api/state', async () => store.getState());

  app.post('/api/lists', async (request, reply) => {
    try { return { ok: true, list: store.addList((request.body || {}) as any) }; }
    catch (error) { return reply.code(400).send({ ok: false, error: message(error) }); }
  });
  app.patch('/api/lists/:id', async (request, reply) => {
    try { return { ok: true, list: store.updateList((request.params as any).id, (request.body || {}) as any) }; }
    catch (error) { return reply.code(400).send({ ok: false, error: message(error) }); }
  });
  app.delete('/api/lists/:id', async (request, reply) => {
    try { store.deleteList((request.params as any).id); return { ok: true }; }
    catch (error) { return reply.code(404).send({ ok: false, error: message(error) }); }
  });

  app.post('/api/items', async (request, reply) => {
    try { return { ok: true, item: store.addItem((request.body || {}) as any) }; }
    catch (error) { return reply.code(400).send({ ok: false, error: message(error) }); }
  });
  app.patch('/api/items/:id', async (request, reply) => {
    try { return { ok: true, item: store.updateItem((request.params as any).id, (request.body || {}) as any) }; }
    catch (error) { return reply.code(400).send({ ok: false, error: message(error) }); }
  });
  app.delete('/api/items/:id', async (request, reply) => {
    try { store.deleteItem((request.params as any).id); return { ok: true }; }
    catch (error) { return reply.code(404).send({ ok: false, error: message(error) }); }
  });
  app.post('/api/completed/clear', async (request) => {
    const body = (request.body || {}) as { listIds?: string[] };
    return { ok: true, removed: store.clearCompleted(Array.isArray(body.listIds) ? body.listIds : undefined) };
  });

  app.setNotFoundHandler((request, reply) => {
    if (!request.url.startsWith('/api/')) return serveIndex(request, reply);
    return reply.code(404).send({ ok: false, error: 'Not found' });
  });

  app.listen({ port: options.port, host: '0.0.0.0' });
  return app;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
