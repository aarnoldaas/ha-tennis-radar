import { BookingCache } from './booking-cache.js';
import { checkFutureAvailability } from './future-scan.js';
import { loadOptions, validateConfig, getEffectiveIntervalMs, type AddonOptions } from './utils/config.js';
import { createServer, globalState } from './server.js';
import { PollingManager } from './polling.js';
import { CourtProviderManager } from './providers/manager.js';
import { HomeAssistantNotifier } from './notifications.js';
import { BookingReminderManager } from './booking-reminders.js';
import { CartActions } from './cart-actions.js';
import { HomeAssistantEvents } from './ha-events.js';
import { matchingSlots } from './providers/matching.js';
import { scanDatePlan } from './utils/scan-dates.js';
import type { CheckResult } from './providers/manager.js';
import type { Booking } from './providers/types.js';

// Booking fetches are network-heavy (BT does an HTML scrape with login), so the
// shared HTTP cache refreshes hourly. A cheap in-memory tick re-evaluates the cached
// bookings against the current time every 30 min so threshold crossings are
// detected promptly between fetches.
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

const cartActions = new CartActions(() => options);
const notifier = new HomeAssistantNotifier(slots => cartActions.create(slots));
const haEvents = new HomeAssistantEvents(async action => {
  const message = await cartActions.handle(action);
  if (!message) return;
  const result = cartActions.list().find(item => item.id === action);
  const title = result?.state === 'paid' ? 'SEB booking confirmed' : 'SEB booking result';
  await Promise.allSettled([
    notifier.sendPersistentNotification(message, title, 'tennis_cart_result'),
    ...(options.notify_device ? [notifier.sendMobilePush(options.notify_device, title, message,
      result?.bookingsUrl ? [{action: 'URI', title: 'View SEB bookings', uri: result.bookingsUrl}] : undefined)] : []),
  ]).then(results => results.forEach(result => { if (result.status === 'rejected') console.error('[SEB booking] Result notification failed:', result.reason); }));
  if (result?.state === 'paid') {
    bookingCache = createBookingCache();
    void refetchBookingsAndTick();
  }
});
haEvents.start();
const reminderManager = new BookingReminderManager();
let providerManager = new CourtProviderManager(options);
const futureOptions = () => ({...options,baltic_tennis_enabled:false});
let futureProviderManager = new CourtProviderManager(futureOptions(), 2_000);
function createBookingCache(): BookingCache {
  const manager = providerManager;
  return new BookingCache(() => manager.fetchBookings(scanDatePlan(options).future.at(-1)));
}
let bookingCache = createBookingCache();
let configRevision = 0;
const scans: Record<'near' | 'future', CheckResult> = {near:{slots:[],errors:[]},future:{slots:[],errors:[]}};
const futureIntervalMs = () => options.seb_future_interval_hours * 60 * 60_000;

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
  const cache = bookingCache;
  try {
    const { bookings, errors } = await cache.get();
    if (cache !== bookingCache) return;
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
  const revision = configRevision;
  const refresh = async () => {
    await refetchBookingsAndTick();
    if (revision === configRevision) {
      bookingFetchTimer = setTimeout(() => void refresh(), Math.max(1, bookingCache.refreshInMs));
    }
  };
  void refresh();
  bookingTickTimer = setInterval(() => void tickBookingReminders(), BOOKING_TICK_INTERVAL_MS);
}

function stopBookingTimers(): void {
  if (bookingFetchTimer) clearInterval(bookingFetchTimer);
  if (bookingTickTimer) clearInterval(bookingTickTimer);
  bookingFetchTimer = null;
  bookingTickTimer = null;
}

async function scan(scope: 'near' | 'future') {
  const revision = configRevision;
  const manager = scope === 'near' ? providerManager : futureProviderManager;
  const plan = scanDatePlan(options);
  let dates = plan[scope];
  let skippedDates: string[] = [];
  const start = Date.now();
  let result: CheckResult = {slots:[],errors:[]};
  if (manager.hasActiveProviders && dates.length) {
    if (scope === 'future') {
      try {
        const checked = await checkFutureAvailability(dates,
          () => bookingCache.get(),
          remaining => revision === configRevision ? manager.checkAll(remaining) : Promise.resolve({slots:[],errors:[]}));
        result = checked.result;
        dates = checked.dates;
        skippedDates = checked.skippedDates;
        console.log(`[TennisRadar] Future scan skipped ${skippedDates.length} booked date(s): ${skippedDates.join(', ') || 'none'}`);
      } catch (error) {
        result.errors = [{provider:'Existing bookings',date:dates.join(', '),error:error instanceof Error ? error.message : String(error),time:new Date().toISOString(),nextRetryAt:new Date(Date.now()+futureIntervalMs()).toISOString(),failures:1}];
        dates = [];
      }
    } else {
      result = await manager.checkAll(dates);
    }
  }
  if (revision !== configRevision) return; // Discard results from replaced settings.
  scans[scope] = result;
  const now = new Date().toISOString();
  globalState.lastPollTime = now;
  if (scope === 'future') globalState.futureScan = {lastScan:now,nextScan:new Date(Date.now()+futureIntervalMs()).toISOString(),datesChecked:dates.length,skippedDates,intervalHours:options.seb_future_interval_hours};
  // The two schedules keep independent results; a near scan cannot erase future slots.
  globalState.latestResults = [
    ...scans.near.slots.filter(slot=>plan.near.includes(slot.date)),
    ...scans.future.slots.filter(slot=>plan.future.includes(slot.date)),
  ];
  const errors = [...scans.near.errors,...scans.future.errors.map(error=>({...error,provider:`${error.provider} (future dates)`,nextRetryAt:globalState.futureScan?.nextScan ?? error.nextRetryAt}))];
  globalState.providerErrors = errors;
  globalState.disabledProviders = [];
  const providerBreakdown: Record<string, number> = {};
  for (const slot of globalState.latestResults) providerBreakdown[slot.provider]=(providerBreakdown[slot.provider]??0)+1;
  globalState.pollStats = {durationMs:Date.now()-start,datesChecked:plan.near.length+(globalState.futureScan?.datesChecked ?? 0),totalSlots:globalState.latestResults.length,providerBreakdown};
  for (const name of notifiedErrors) if (!errors.some(error=>error.provider===name)) notifiedErrors.delete(name);
  for (const error of errors) {
    if (error.failures >= 3 && !notifiedErrors.has(error.provider)) {
      notifiedErrors.add(error.provider);
      await notifier.sendError(`Tennis Radar: ${error.provider} is temporarily unavailable after ${error.failures} failures. ${error.error}. Automatic retries continue.`,options.notify_device || undefined);
    }
  }
  const matching = matchingSlots(result.slots,options);
  if (matching.length) await notifier.sendCourtAlert(matching,options.notify_device || undefined);
  console.log(`[TennisRadar] ${scope} scan: ${dates.length} dates, ${matching.length} matching slots.`);
}

const poller = new PollingManager(async () => {
  await scan('near');
  poller.updateInterval(getEffectiveIntervalMs(options));
}, {intervalMs:getEffectiveIntervalMs(options)});
const futurePoller = new PollingManager(() => scan('future'), {intervalMs:futureIntervalMs(),maxBackoffMs:24*60*60_000});

function onConfigChange(newOptions: AddonOptions) {
  console.log('[TennisRadar] Config updated, reloading providers...');
  configRevision++;
  options = newOptions;
  scans.near = {slots:[],errors:[]};
  scans.future = {slots:[],errors:[]};
  globalState.latestResults = [];
  globalState.futureScan = null;
  providerManager.disposeAll();
  providerManager = new CourtProviderManager(options);
  bookingCache = createBookingCache();
  cachedBookings = [];
  futureProviderManager.disposeAll();
  futureProviderManager = new CourtProviderManager(futureOptions(), 2_000);
  globalState.providerErrors = [];
  globalState.disabledProviders = [];
  notifiedErrors.clear();
  poller.updateInterval(getEffectiveIntervalMs(options));
  poller.requestPoll();
  futurePoller.updateInterval(futureIntervalMs());
  futurePoller.requestPoll();
  startBookingTimers();
}

function onResumeProviders() {
  providerManager.resumeAll();
  futureProviderManager.resumeAll();
  globalState.providerErrors = [];
  globalState.disabledProviders = [];
  notifiedErrors.clear();
  poller.requestPoll();
  futurePoller.requestPoll();
  console.log('[TennisRadar] All providers resumed via UI');
}

createServer({
  port: 8099,
  getScanStatus: () => ({near: poller.getStatus(), future: futurePoller.getStatus()}),
  testNotification: async () => {
    if (!options.notify_device.trim()) throw new Error('Save a mobile notification device first.');
    await notifier.sendMobilePush(options.notify_device, 'Tennis Radar test', 'Phone notifications are working. Court alerts are sent when selected dates have matching availability.');
  },
  getOptions: () => options,
  onConfigChange,
  onResumeProviders,
  fetchBookings: () => bookingCache.get(),
  getCartStatus: () => ({connected: haEvents.connected, actions: cartActions.list()}),
});
poller.start();
futurePoller.start();
startBookingTimers();

const shutdown = async (signal: string) => {
  console.log(`[TennisRadar] Received ${signal}, shutting down...`);
  configRevision++;
  stopBookingTimers();
  haEvents.stop();
  await Promise.all([poller.stop(),futurePoller.stop()]);
  futureProviderManager.disposeAll();
  providerManager.disposeAll();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
