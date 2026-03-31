import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import type { TimeSlot } from './providers/types.js';
import type { AddonOptions, ConfigWarning } from './utils/config.js';
import { loadOptions, saveOptions, validateConfig } from './utils/config.js';
import { getInvestmentData, loadInvestmentData, refreshInvestmentPrices } from './investments/portfolio-service.js';
import { loadEcbRates } from './investments/currency.js';
import { loadSavedSuggestions, generateAiSuggestions } from './investments/ai-suggestions.js';

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

const BROKER_DIRS: Record<string, string> = {
  swedbank: 'swedbank',
  'interactive-brokers': 'interactive-brokers',
  revolut: 'revolut',
  wix: 'wix',
};

/** Find a hashed asset file like "app-AB12CD34.js" for a given base name and extension. */
function findAsset(dir: string, base: string, ext: string): string {
  const files = readdirSync(dir);
  const match = files.find(f => f.startsWith(`${base}-`) && f.endsWith(`.${ext}`) && !f.endsWith(`.${ext}.map`));
  return match || `${base}.${ext}`;
}

export function createServer(options: { port: number; dataDir: string; getOptions: () => AddonOptions; onConfigChange: (opts: AddonOptions) => void; onResumeProviders: () => void; fetchBookings: () => Promise<{ bookings: any[]; errors: string[] }> }) {
  const app = Fastify({ logger: true });
  app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  const appDir = resolve(process.env.APP_DIR || '/app');
  const publicDir = join(appDir, 'public');
  const investmentsDir = join(options.dataDir, 'Investments');

  // Discover hashed asset filenames produced by esbuild
  const appJs = findAsset(publicDir, 'app', 'js');
  const appCss = findAsset(publicDir, 'app', 'css');
  const investJs = findAsset(publicDir, 'investments', 'js');
  const investCss = findAsset(publicDir, 'investments', 'css');

  // Disable caching on all responses
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    reply.header('Surrogate-Control', 'no-store');
  });

  // Serve static frontend assets (css, js)
  app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/static/',
    decorateReply: true,
    cacheControl: false,
    etag: false,
    lastModified: false,
  });

  // Inject ingress path and hashed asset names into the HTML template
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

  // Serve investments page
  const serveInvestments = async (request: any, reply: any) => {
    const ingressPath = (request.headers['x-ingress-path'] as string) || '';
    const html = readFileSync(join(publicDir, 'investments.html'), 'utf-8')
      .replace(/\{\{INGRESS_PATH\}\}/g, ingressPath)
      .replace(/\{\{INVEST_JS\}\}/g, investJs)
      .replace(/\{\{INVEST_CSS\}\}/g, investCss);
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

  // API: list uploaded investment files
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

  // API: upload investment files
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

    // Reload investment data after upload
    if (uploaded.length > 0) {
      await loadEcbRates();
      await loadInvestmentData(options.dataDir);
    }

    return { success: true, uploaded };
  });

  // API: delete an investment file
  app.delete('/api/investments/files/:broker/:filename', async (request) => {
    const { broker, filename } = request.params as { broker: string; filename: string };
    const brokerDir = BROKER_DIRS[broker];
    if (!brokerDir) return { success: false, error: 'Unknown broker' };

    const filePath = join(investmentsDir, brokerDir, filename);
    if (!existsSync(filePath)) return { success: false, error: 'File not found' };

    unlinkSync(filePath);

    // Reload investment data after deletion
    await loadEcbRates();
    await loadInvestmentData(options.dataDir);

    return { success: true };
  });

  // API: get saved AI suggestions
  app.get('/api/investments/ai-suggestions', async () => {
    return loadSavedSuggestions() || { suggestions: null, generatedAt: null };
  });

  // API: generate new AI suggestions
  app.post('/api/investments/ai-suggestions', async () => {
    const config = options.getOptions();
    if (!config.anthropic_api_key) {
      return { success: false, error: 'Anthropic API key not configured. Add it in the Settings screen.' };
    }
    const data = getInvestmentData();
    if (!data || data.holdings.length === 0) {
      return { success: false, error: 'No portfolio data available. Upload investment files first.' };
    }
    try {
      const result = await generateAiSuggestions(config.anthropic_api_key, data);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.listen({ port: options.port, host: '0.0.0.0' });
  return app;
}
