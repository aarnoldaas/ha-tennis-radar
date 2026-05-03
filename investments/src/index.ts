import { createServer } from './server.js';

const dataDir = process.env.DATA_DIR || '/data';

createServer({
  port: 8099,
  dataDir,
});

const shutdown = async (signal: string) => {
  console.log(`[Investments] Received ${signal}, shutting down...`);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
