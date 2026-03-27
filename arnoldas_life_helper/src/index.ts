import { loadOptions, getEffectiveDates, validateConfig, type AddonOptions } from './utils/config.js';
import { createServer, globalState } from './server.js';
import { PollingManager } from './polling.js';
import { CourtProviderManager } from './providers/manager.js';
import { HomeAssistantNotifier } from './notifications.js';
import { loadInvestmentData } from './investments/portfolio-service.js';

let options = loadOptions();
console.log('[TennisRadar] Configuration loaded:', {
  poll_interval_seconds: options.poll_interval_seconds,
  preferred_start_time: options.preferred_start_time,
  preferred_end_time: options.preferred_end_time,
  seb_enabled: options.seb_enabled,
  baltic_tennis_enabled: options.baltic_tennis_enabled,
  debug: options.debug,
});

const configWarnings = validateConfig(options);
if (configWarnings.length > 0) {
  console.warn('[TennisRadar] Config warnings:', configWarnings.map(w => w.message).join('; '));
}

const notifier = new HomeAssistantNotifier();
let providerManager = new CourtProviderManager(options);

// Track which providers we've already sent error notifications for
const notifiedErrors = new Set<string>();

const poller = new PollingManager(
  async () => {
    const dates = getEffectiveDates(options.scan_dates);
    console.log(`[TennisRadar] Polling for dates: ${dates.join(', ')}`);

    const pollStart = Date.now();
    const { slots: results, errors } = await providerManager.checkAll(dates);
    const durationMs = Date.now() - pollStart;

    globalState.latestResults = results;
    globalState.lastPollTime = new Date().toISOString();
    // Accumulate errors from disabled providers
    globalState.providerErrors = errors;
    globalState.disabledProviders = providerManager.disabledProviderNames;

    // Build per-provider breakdown
    const providerBreakdown: Record<string, number> = {};
    for (const slot of results) {
      providerBreakdown[slot.provider] = (providerBreakdown[slot.provider] || 0) + 1;
    }
    globalState.pollStats = {
      durationMs,
      datesChecked: dates.length,
      totalSlots: results.length,
      providerBreakdown,
    };

    // Notify about newly failed providers
    for (const err of errors) {
      if (!notifiedErrors.has(err.provider)) {
        notifiedErrors.add(err.provider);
        await notifier.sendError(
          `Tennis Radar: ${err.provider} failed and was disabled. Error: ${err.error}. Check config or resume from the UI.`,
          options.notify_device || undefined,
        );
      }
    }

    const matching = results.filter(slot =>
      slot.status === 'available' &&
      slot.startTime >= options.preferred_start_time &&
      slot.startTime <= options.preferred_end_time &&
      slot.durationMinutes >= options.preferred_duration_minutes,
    );

    console.log(`[TennisRadar] Found ${results.length} total slots, ${matching.length} matching preferences (${durationMs}ms).`);

    if (matching.length > 0) {
      await notifier.sendCourtAlert(matching, options.notify_device || undefined);
    }
  },
  { intervalMs: options.poll_interval_seconds * 1000 },
);

function onConfigChange(newOptions: AddonOptions) {
  console.log('[TennisRadar] Config updated, reloading providers...');
  options = newOptions;
  providerManager.disposeAll();
  providerManager = new CourtProviderManager(options);
  globalState.providerErrors = [];
  globalState.disabledProviders = [];
  notifiedErrors.clear();
  poller.updateInterval(options.poll_interval_seconds * 1000);
  poller.start();
}

function onResumeProviders() {
  providerManager.resumeAll();
  globalState.providerErrors = [];
  globalState.disabledProviders = [];
  notifiedErrors.clear();
  console.log('[TennisRadar] All providers resumed via UI');
}

// Load investment data
const dataDir = process.env.DATA_DIR || '/data';
loadInvestmentData(dataDir).catch(err => {
  console.error('[Investments] Failed to load portfolio data:', err);
});

// Start web UI and polling
createServer({ port: 8099, getOptions: () => options, onConfigChange, onResumeProviders, fetchBookings: () => providerManager.fetchBookings() });
poller.start();

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`[TennisRadar] Received ${signal}, shutting down...`);
  await poller.stop();
  providerManager.disposeAll();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
