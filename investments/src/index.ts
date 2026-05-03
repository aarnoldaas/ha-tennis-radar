import { loadOptions, type AddonOptions } from './utils/config.js';
import { createServer } from './server.js';
import { loadInvestmentData } from './investments/portfolio-service.js';
import { loadEcbRates } from './investments/currency.js';

let options = loadOptions();
console.log('[Investments] Configuration loaded:', {
  hasAnthropicKey: !!options.anthropic_api_key,
  debug: options.debug,
});

function onConfigChange(newOptions: AddonOptions) {
  options = newOptions;
  console.log('[Investments] Config updated');
}

const dataDir = process.env.DATA_DIR || '/data';
loadEcbRates()
  .then(() => loadInvestmentData(dataDir))
  .catch(err => {
    console.error('[Investments] Failed to load portfolio data:', err);
  });

createServer({
  port: 8099,
  dataDir,
  getOptions: () => options,
  onConfigChange,
});

const shutdown = async (signal: string) => {
  console.log(`[Investments] Received ${signal}, shutting down...`);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
