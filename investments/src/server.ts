import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

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

export function createServer(options: { port: number; dataDir: string }) {
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
    return { success: true };
  });

  app.listen({ port: options.port, host: '0.0.0.0' });
  return app;
}
