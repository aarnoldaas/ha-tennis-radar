import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import type { AddonOptions } from './utils/config.js';
import { loadOptions, saveOptions } from './utils/config.js';
import { getInvestmentData, loadInvestmentData, refreshInvestmentPrices } from './investments/portfolio-service.js';
import { loadEcbRates } from './investments/currency.js';
import { loadSavedSuggestions, generateAiSuggestions } from './investments/ai-suggestions.js';
import { loadPlan, savePlan, refinePlanWithAi } from './investments/plan-service.js';
import { getFileBasedPriceHistory, updatePriceEntry, deletePriceEntry } from './investments/prices.js';

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

export function createServer(options: { port: number; dataDir: string; getOptions: () => AddonOptions; onConfigChange: (opts: AddonOptions) => void }) {
  const app = Fastify({ logger: true });
  app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  const appDir = resolve(process.env.APP_DIR || '/app');
  const publicDir = join(appDir, 'public');
  const investmentsDir = join(options.dataDir, 'Investments');

  const appJs = findAsset(publicDir, 'app', 'js');
  const appCss = findAsset(publicDir, 'app', 'css');

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

  // API: get investment plan
  app.get('/api/investments/plan', async () => {
    return loadPlan() || { content: '', updatedAt: null };
  });

  // API: save investment plan
  app.post('/api/investments/plan', async (request) => {
    const { content } = request.body as { content: string };
    const plan = savePlan(content);
    return { success: true, ...plan };
  });

  // API: refine plan with AI
  app.post('/api/investments/plan/refine', async () => {
    const config = options.getOptions();
    if (!config.anthropic_api_key) {
      return { success: false, error: 'Anthropic API key not configured. Add it in the Settings screen.' };
    }
    const data = getInvestmentData();
    if (!data || data.holdings.length === 0) {
      return { success: false, error: 'No portfolio data available. Upload investment files first.' };
    }
    const plan = loadPlan();
    if (!plan?.content?.trim()) {
      return { success: false, error: 'Write your plan first before refining it with AI.' };
    }
    try {
      const result = await refinePlanWithAi(config.anthropic_api_key, data, plan.content);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // API: get file-based price history (editable entries only)
  app.get('/api/investments/price-history', async () => {
    return getFileBasedPriceHistory();
  });

  // API: upsert a price entry for a ticker
  app.put('/api/investments/price-history/:ticker', async (request) => {
    const { ticker } = request.params as { ticker: string };
    const { date, price } = request.body as { date: string; price: number };
    if (!date || typeof price !== 'number') return { success: false, error: 'date and price are required' };
    updatePriceEntry(ticker.toUpperCase(), date, price);
    return { success: true };
  });

  // API: delete a price entry for a ticker by date
  app.delete('/api/investments/price-history/:ticker/:date', async (request) => {
    const { ticker, date } = request.params as { ticker: string; date: string };
    deletePriceEntry(ticker.toUpperCase(), date);
    return { success: true };
  });

  app.listen({ port: options.port, host: '0.0.0.0' });
  return app;
}
