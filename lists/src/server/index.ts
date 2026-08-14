import { createServer } from './server';

const dataDir = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : './data');
createServer({ port: Number(process.env.PORT || 8100), dataDir });

const shutdown = (signal: string) => {
  console.log(`[Home Lists] Received ${signal}, shutting down...`);
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
