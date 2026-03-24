import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

export function createServer(options: { port: number; getOptions: () => AddonOptions; onConfigChange: (opts: AddonOptions) => void }) {
  const app = Fastify({ logger: true });
  const appDir = resolve(process.env.APP_DIR || '/app');
  const publicDir = join(appDir, 'public');

  // Disable caching on all responses
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  });

  // Serve static frontend assets (css, js)
  app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/static/',
    decorateReply: true,
  });

  // Inject ingress path into the HTML template
  const serveIndex = async (request: any, reply: any) => {
    const ingressPath = (request.headers['x-ingress-path'] as string) || '';
    const html = readFileSync(join(publicDir, 'index.html'), 'utf-8')
      .replace(/\{\{INGRESS_PATH\}\}/g, ingressPath);
    reply.type('text/html').send(html);
  };
  app.get('/', serveIndex);
  app.get('//', serveIndex);

  // API: return current status
  app.get('/api/status', async () => {
    return {
      running: true,
      lastPoll: globalState.lastPollTime,
      totalSlots: globalState.latestResults.length,
      availableSlots: globalState.latestResults.filter(s => {
        const opts = options.getOptions();
        return s.status === 'available' &&
          s.startTime >= opts.preferred_start_time &&
          s.startTime <= opts.preferred_end_time &&
          s.durationMinutes >= opts.preferred_duration_minutes;
      }),
    };
  });

  // API: get config
  app.get('/api/config', async () => {
    const opts = loadOptions();
    // Don't send session token in full
    return {
      ...opts,
      teniso_pasaulis_session_token: opts.teniso_pasaulis_session_token ? '••••••••' : '',
      baltic_tennis_session_token: opts.baltic_tennis_session_token ? '••••••••' : '',
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
      baltic_tennis_session_token:
        body.baltic_tennis_session_token === '••••••••' || body.baltic_tennis_session_token === ''
          ? current.baltic_tennis_session_token
          : (body.baltic_tennis_session_token ?? current.baltic_tennis_session_token),
    };

    saveOptions(updated);
    options.onConfigChange(updated);

    return { success: true };
  });

  app.listen({ port: options.port, host: '0.0.0.0' });
  return app;
}
