import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TimeSlot } from './providers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Shared state — updated by the polling loop
export const globalState: {
  lastPollTime: string | null;
  latestResults: TimeSlot[];
} = {
  lastPollTime: null,
  latestResults: [],
};

export function createServer(options: { port: number }) {
  const app = Fastify({ logger: true });

  // Serve static frontend assets
  app.register(fastifyStatic, {
    root: join(__dirname, '../public'),
    prefix: '/',
    decorateReply: true,
  });

  // Inject ingress path into the HTML template
  app.get('/', async (request, reply) => {
    const ingressPath = (request.headers['x-ingress-path'] as string) || '';
    const html = readFileSync(join(__dirname, '../public/index.html'), 'utf-8')
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

  app.listen({ port: options.port, host: '0.0.0.0' });
  return app;
}
