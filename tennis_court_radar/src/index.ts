import { loadOptions, getEffectiveDates, type AddonOptions } from './utils/config.js';
import { createServer, globalState } from './server.js';
import { PollingManager } from './polling.js';
import { CourtProviderManager } from './providers/manager.js';
import { HomeAssistantNotifier } from './notifications.js';

let options = loadOptions();
console.log('[TennisRadar] Configuration loaded:', {
  poll_interval_seconds: options.poll_interval_seconds,
  preferred_start_time: options.preferred_start_time,
  preferred_end_time: options.preferred_end_time,
  teniso_pasaulis_enabled: options.teniso_pasaulis_enabled,
  baltic_tennis_enabled: options.baltic_tennis_enabled,
  debug: options.debug,
});

const notifier = new HomeAssistantNotifier();
let providerManager = new CourtProviderManager(options);

const poller = new PollingManager(
  async () => {
    const dates = getEffectiveDates(options.scan_dates);
    console.log(`[TennisRadar] Polling for dates: ${dates.join(', ')}`);

    const results = await providerManager.checkAll(dates);
    globalState.latestResults = results;
    globalState.lastPollTime = new Date().toISOString();

    const matching = results.filter(slot =>
      slot.status === 'available' &&
      slot.startTime >= options.preferred_start_time &&
      slot.startTime <= options.preferred_end_time &&
      slot.durationMinutes >= options.preferred_duration_minutes,
    );

    console.log(`[TennisRadar] Found ${results.length} total slots, ${matching.length} matching preferences.`);

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
  poller.updateInterval(options.poll_interval_seconds * 1000);
}

// Start web UI and polling
createServer({ port: 8099, getOptions: () => options, onConfigChange });
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
