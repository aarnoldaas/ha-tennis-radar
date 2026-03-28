import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TimeSlot } from './providers/types.js';
import type { AddonOptions, ConfigWarning } from './utils/config.js';
import { loadOptions, saveOptions, validateConfig } from './utils/config.js';
import { getInvestmentData, refreshInvestmentPrices } from './investments/portfolio-service.js';
import { loadEcbRates } from './investments/currency.js';

// Shared state — updated by the polling loop
export interface PollStats {
  durationMs: number;
  datesChecked: number;
  totalSlots: number;
  providerBreakdown: Record<string, number>;
}

export interface ProviderError {
  provider: string;
  date: string;
  error: string;
  time: string;
}

export const globalState: {
  lastPollTime: string | null;
  latestResults: TimeSlot[];
  pollStats: PollStats | null;
  providerErrors: ProviderError[];
  disabledProviders: string[];
} = {
  lastPollTime: null,
  latestResults: [],
  pollStats: null,
  providerErrors: [],
  disabledProviders: [],
};

export function createServer(options: { port: number; getOptions: () => AddonOptions; onConfigChange: (opts: AddonOptions) => void; onResumeProviders: () => void; fetchBookings: () => Promise<{ bookings: any[]; errors: string[] }> }) {
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

  // Serve investments page
  const serveInvestments = async (request: any, reply: any) => {
    const ingressPath = (request.headers['x-ingress-path'] as string) || '';
    const html = readFileSync(join(publicDir, 'investments.html'), 'utf-8')
      .replace(/\{\{INGRESS_PATH\}\}/g, ingressPath);
    reply.type('text/html').send(html);
  };
  app.get('/investments', serveInvestments);
  app.get('/investments/', serveInvestments);

  // API: investment data
  app.get('/api/investments', async () => {
    const data = getInvestmentData();
    if (!data) return { transactions: [], holdings: [], interestSummary: null };
    return data;
  });

  // API: refresh investment prices and ECB rates
  app.post('/api/investments/refresh', async () => {
    try {
      await loadEcbRates();
      const result = await refreshInvestmentPrices();
      const data = getInvestmentData();
      return { success: true, ...result, data };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // API: return current status
  app.get('/api/status', async () => {
    const opts = options.getOptions();
    return {
      running: true,
      lastPoll: globalState.lastPollTime,
      totalSlots: globalState.latestResults.length,
      pollStats: globalState.pollStats,
      configWarnings: validateConfig(opts),
      providerErrors: globalState.providerErrors,
      disabledProviders: globalState.disabledProviders,
      availableSlots: globalState.latestResults.filter(s => {
        return s.status === 'available' &&
          s.startTime >= opts.preferred_start_time &&
          s.startTime <= opts.preferred_end_time &&
          s.durationMinutes >= opts.preferred_duration_minutes;
      }),
    };
  });

  // API: get config
  app.get('/api/config', async () => {
    return loadOptions();
  });

  // API: save config
  app.post('/api/config', async (request) => {
    const body = request.body as Partial<AddonOptions>;
    const current = loadOptions();

    const updated: AddonOptions = {
      ...current,
      ...body,
    };

    saveOptions(updated);
    options.onConfigChange(updated);

    return { success: true };
  });

  // API: fetch bookings on demand
  app.get('/api/bookings', async () => {
    try {
      return await options.fetchBookings();
    } catch (err) {
      return { bookings: [], errors: [err instanceof Error ? err.message : String(err)] };
    }
  });

  // API: resume disabled providers
  app.post('/api/resume', async () => {
    options.onResumeProviders();
    return { success: true };
  });

  app.listen({ port: options.port, host: '0.0.0.0' });
  return app;
}
