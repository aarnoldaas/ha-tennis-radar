import { loadOptions, getEffectiveDates, validateConfig, getEffectiveIntervalMs, type AddonOptions } from './utils/config.js';
import { createServer, globalState } from './server.js';
import { PollingManager } from './polling.js';
import { CourtProviderManager } from './providers/manager.js';
import { HomeAssistantNotifier } from './notifications.js';
import { BookingReminderManager } from './booking-reminders.js';
import type { Booking } from './providers/types.js';

// Booking fetches are network-heavy (BT does an HTML scrape with login), so the
// HTTP fetch runs every 6h. A cheap in-memory tick re-evaluates the cached
// bookings against the current time every 30 min so threshold crossings are
// detected promptly between fetches.
const BOOKING_FETCH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BOOKING_TICK_INTERVAL_MS = 30 * 60 * 1000;

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
const reminderManager = new BookingReminderManager();
let providerManager = new CourtProviderManager(options);

// Track which providers we've already sent error notifications for
const notifiedErrors = new Set<string>();

let cachedBookings: Booking[] = [];
let cachedBookingsAt: Date | null = null;

async function tickBookingReminders(): Promise<void> {
  if (cachedBookings.length === 0) return;
  try {
    const due = reminderManager.check(cachedBookings);
    if (due.length === 0) return;
    console.log(`[BookingReminders] Sending ${due.length} reminder(s) from cache (${cachedBookings.length} booking(s))`);
    for (const r of due) {
      await notifier.sendBookingReminder(
        r.booking,
        r.threshold,
        r.hoursUntil,
        options.notify_device || undefined,
      );
    }
  } catch (err) {
    console.error('[BookingReminders] Tick failed:', err);
  }
}

async function refetchBookingsAndTick(): Promise<void> {
  if (providerManager.providerCount === 0) {
    cachedBookings = [];
    return;
  }
  try {
    const { bookings, errors } = await providerManager.fetchBookings();
    if (errors.length > 0) {
      console.warn('[BookingReminders] Some providers failed to return bookings:', errors.join('; '));
    }
    cachedBookings = bookings;
    cachedBookingsAt = new Date();
    console.log(`[BookingReminders] Cached ${bookings.length} booking(s) at ${cachedBookingsAt.toISOString()}`);
  } catch (err) {
    console.error('[BookingReminders] Fetch failed (keeping previous cache):', err);
  }
  await tickBookingReminders();
}

let bookingFetchTimer: ReturnType<typeof setInterval> | null = null;
let bookingTickTimer: ReturnType<typeof setInterval> | null = null;

function startBookingTimers(): void {
  if (bookingFetchTimer) clearInterval(bookingFetchTimer);
  if (bookingTickTimer) clearInterval(bookingTickTimer);
  bookingFetchTimer = setInterval(() => void refetchBookingsAndTick(), BOOKING_FETCH_INTERVAL_MS);
  bookingTickTimer = setInterval(() => void tickBookingReminders(), BOOKING_TICK_INTERVAL_MS);
}

function stopBookingTimers(): void {
  if (bookingFetchTimer) clearInterval(bookingFetchTimer);
  if (bookingTickTimer) clearInterval(bookingTickTimer);
  bookingFetchTimer = null;
  bookingTickTimer = null;
}

const poller = new PollingManager(
  async () => {
    if (!providerManager.hasActiveProviders) {
      console.log('[TennisRadar] Skipping poll — no active providers');
      return;
    }

    const dates = getEffectiveDates(options.scan_dates);
    console.log(`[TennisRadar] Polling for dates: ${dates.join(', ')}`);

    const pollStart = Date.now();
    const { slots: results, errors } = await providerManager.checkAll(dates);
    const durationMs = Date.now() - pollStart;

    globalState.latestResults = results;
    globalState.lastPollTime = new Date().toISOString();
    globalState.providerErrors = errors;
    globalState.disabledProviders = providerManager.disabledProviderNames;

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

    poller.updateInterval(getEffectiveIntervalMs(options));

    if (matching.length > 0) {
      await notifier.sendCourtAlert(matching, options.notify_device || undefined);
    }
  },
  { intervalMs: getEffectiveIntervalMs(options) },
);

function onConfigChange(newOptions: AddonOptions) {
  console.log('[TennisRadar] Config updated, reloading providers...');
  options = newOptions;
  providerManager.disposeAll();
  providerManager = new CourtProviderManager(options);
  globalState.providerErrors = [];
  globalState.disabledProviders = [];
  notifiedErrors.clear();
  poller.updateInterval(getEffectiveIntervalMs(options));
  poller.start();
  startBookingTimers();
  void refetchBookingsAndTick();
}

function onResumeProviders() {
  providerManager.resumeAll();
  globalState.providerErrors = [];
  globalState.disabledProviders = [];
  notifiedErrors.clear();
  console.log('[TennisRadar] All providers resumed via UI');
}

createServer({
  port: 8099,
  getOptions: () => options,
  onConfigChange,
  onResumeProviders,
  fetchBookings: () => providerManager.fetchBookings(),
});
poller.start();
startBookingTimers();
void refetchBookingsAndTick();

const shutdown = async (signal: string) => {
  console.log(`[TennisRadar] Received ${signal}, shutting down...`);
  stopBookingTimers();
  await poller.stop();
  providerManager.disposeAll();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
