import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TimeSlot } from './providers/types.js';
import type { AddonOptions } from './utils/config.js';
import { loadOptions, saveOptions } from './utils/config.js';

// Shared state — updated by the polling loop
export const globalState: {
  lastPollTime: string | null;
  latestResults: TimeSlot[];
} = {
  lastPollTime: null,
  latestResults: [],
};

export function createServer(options: { port: number; onConfigChange: (opts: AddonOptions) => void }) {
  const app = Fastify({ logger: true });

  // Serve static frontend assets
  app.register(fastifyStatic, {
    root: join('/app', 'public'),
    prefix: '/',
    decorateReply: true,
  });

  // Inject ingress path into the HTML template
  app.get('/', async (request, reply) => {
    const ingressPath = (request.headers['x-ingress-path'] as string) || '';
    const html = readFileSync(join('/app', 'public', 'index.html'), 'utf-8')
      .replace(/\{\{INGRESS_PATH\}\}/g, ingressPath);
    reply.type('text/html').send(html);
  });

  // API: return current status
  app.get('/api/status', async () => {
    return {
      running: true,
      lastPoll: globalState.lastPollTime,
      totalSlots: globalState.latestResults.length,
      availableSlots: globalState.latestResults.filter(s => s.status === 'available'),
    };
  });

  // API: get config
  app.get('/api/config', async () => {
    const opts = loadOptions();
    // Don't send session token in full
    return {
      ...opts,
      teniso_pasaulis_session_token: opts.teniso_pasaulis_session_token ? '••••••••' : '',
    };
  });

  // API: save config
  app.post('/api/config', async (request) => {
    const body = request.body as Partial<AddonOptions>;
    const current = loadOptions();

    const updated: AddonOptions = {
      ...current,
      ...body,
      // If token is masked, keep the old one
      teniso_pasaulis_session_token:
        body.teniso_pasaulis_session_token === '••••••••' || body.teniso_pasaulis_session_token === ''
          ? current.teniso_pasaulis_session_token
          : (body.teniso_pasaulis_session_token ?? current.teniso_pasaulis_session_token),
    };

    saveOptions(updated);
    options.onConfigChange(updated);

    return { success: true };
  });

  app.listen({ port: options.port, host: '0.0.0.0' });
  return app;
}
