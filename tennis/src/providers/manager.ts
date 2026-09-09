import type { AddonOptions } from '../utils/config.js';
import type { ICourtProvider, TimeSlot, Booking } from './types.js';
import { SebProvider } from './seb.js';
import { BalticTennisProvider } from './baltic-tennis.js';

export interface ProviderErrorInfo {
  provider: string;
  date: string;
  error: string;
  time: string;
  nextRetryAt: string;
  failures: number;
}

export interface CheckResult {
  slots: TimeSlot[];
  errors: ProviderErrorInfo[];
}

const MAX_RETRY_DELAY_MS = 5 * 60_000;

export class CourtProviderManager {
  private providers: ICourtProvider[] = [];
  private radarEnabled = new Set<string>();
  private providerErrors = new Map<string, ProviderErrorInfo>();
  private consecutiveFailures = new Map<string, number>();

  constructor(options: AddonOptions) {
    // Instantiate every provider that has credentials so bookings can always be
    // fetched. The *_enabled flags only control whether the provider participates
    // in radar polling.
    if (options.seb_session_token) {
      const seb = new SebProvider(options.seb_session_token, options.seb_places);
      this.providers.push(seb);
      if (options.seb_enabled) this.radarEnabled.add(seb.name);
    }
    if (options.baltic_tennis_username && options.baltic_tennis_password) {
      const bt = new BalticTennisProvider(options.baltic_tennis_username, options.baltic_tennis_password);
      this.providers.push(bt);
      if (options.baltic_tennis_enabled) this.radarEnabled.add(bt.name);
    }

    const radarNames = this.providers.filter(p => this.radarEnabled.has(p.name)).map(p => p.name);
    console.log(
      `[ProviderManager] Initialized ${this.providers.length} provider(s): ${this.providers.map(p => p.name).join(', ') || 'none'}` +
        ` — radar-enabled: ${radarNames.join(', ') || 'none'}`,
    );
  }

  async checkAll(dates: string[]): Promise<CheckResult> {
    const allSlots: TimeSlot[] = [];
    const activeProviders = this.providers.filter(
      p => this.radarEnabled.has(p.name) &&
        (!this.providerErrors.has(p.name) || Date.parse(this.providerErrors.get(p.name)!.nextRetryAt) <= Date.now()),
    );

    if (activeProviders.length === 0) {
      return { slots: [], errors: [...this.providerErrors.values()] };
    }

    console.log(`[ProviderManager] Fetching available courts for ${dates.length} date(s): ${dates.join(', ')} (${activeProviders.length} active provider(s))`);

    const results = await Promise.allSettled(
      activeProviders.map(p => {
        console.log(`[ProviderManager] Querying ${p.name} for ${dates.length} date(s)`);
        return p.getAvailability(dates);
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const provider = activeProviders[i];
      if (result.status === 'fulfilled') {
        console.log(`[ProviderManager] ${provider.name} returned ${result.value.length} slot(s)`);
        this.consecutiveFailures.set(provider.name, 0);
        this.providerErrors.delete(provider.name);
        allSlots.push(...result.value);
      } else {
        const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        const failures = (this.consecutiveFailures.get(provider.name) ?? 0) + 1;
        this.consecutiveFailures.set(provider.name, failures);
        const retryDelayMs = Math.min(30_000 * 2 ** Math.min(failures - 1, 4), MAX_RETRY_DELAY_MS);
        console.warn(`[ProviderManager] ${provider.name} failed (${failures}x): ${errMsg}; retrying after ${retryDelayMs}ms`);
        this.providerErrors.set(provider.name, {
          provider: provider.name,
          date: dates.join(', '),
          error: errMsg,
          time: new Date().toISOString(),
          nextRetryAt: new Date(Date.now() + retryDelayMs).toISOString(),
          failures,
        });
      }
    }

    console.log(`[ProviderManager] Total: ${allSlots.length} available slot(s) across all providers and dates`);
    return { slots: allSlots, errors: [...this.providerErrors.values()] };
  }

  resumeProvider(name: string): boolean {
    if (this.providerErrors.has(name)) {
      this.providerErrors.delete(name);
      this.consecutiveFailures.set(name, 0);
      console.log(`[ProviderManager] Resumed provider: ${name}`);
      return true;
    }
    return false;
  }

  resumeAll(): void {
    this.providerErrors.clear();
    this.consecutiveFailures.clear();
    console.log(`[ProviderManager] Resumed all providers`);
  }

  async fetchBookings(throughDate?: string): Promise<{ bookings: Booking[]; errors: string[] }> {
    const allBookings: Booking[] = [];
    const errors: string[] = [];

    for (const provider of this.providers) {
      if (!provider.getBookings) continue;
      try {
        const bookings = await provider.getBookings(throughDate);
        allBookings.push(...bookings);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ProviderManager] ${provider.name} bookings failed:`, msg);
        errors.push(`${provider.name}: ${msg}`);
      }
    }

    const merged = mergeConsecutiveBookings(allBookings);
    merged.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    return { bookings: merged, errors };
  }

  get disabledProviderNames(): string[] {
    return [];
  }

  get providerCount(): number {
    return this.providers.length;
  }

  get hasActiveProviders(): boolean {
    return this.providers.some(p => this.radarEnabled.has(p.name));
  }

  disposeAll(): void {
    this.providers = [];
    this.radarEnabled.clear();
    this.providerErrors.clear();
  }
}

/**
 * Collapses runs of back-to-back bookings on the same court/date into a single
 * combined booking. Two bookings merge when they share `(provider, courtName,
 * date)` and the previous booking's `endTime` equals the next booking's
 * `startTime`. Prices are summed when both share a parseable numeric component
 * and the surrounding template (currency, formatting) matches.
 */
export function mergeConsecutiveBookings(bookings: Booking[]): Booking[] {
  const groups = new Map<string, Booking[]>();
  for (const b of bookings) {
    const key = `${b.provider}|${b.courtName}|${b.date}`;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(b);
  }

  const out: Booking[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.startTime.localeCompare(b.startTime));
    let cur: Booking | null = null;
    for (const b of group) {
      if (cur && cur.endTime === b.startTime) {
        const merged: Booking = {
          ...cur,
          endTime: b.endTime,
          durationMinutes: cur.durationMinutes + b.durationMinutes,
          price: combinePrices(cur.price, b.price),
          status: cur.status ?? b.status,
        };
        cur = merged;
      } else {
        if (cur) out.push(cur);
        cur = { ...b };
      }
    }
    if (cur) out.push(cur);
  }

  return out;
}

function combinePrices(a?: string, b?: string): string | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;

  const parse = (s: string): { num: number; template: string } | null => {
    const match = s.match(/(-?\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    const num = parseFloat(match[1].replace(',', '.'));
    if (Number.isNaN(num)) return null;
    return { num, template: s.replace(match[1], '__N__') };
  };

  const pa = parse(a);
  const pb = parse(b);
  if (pa && pb && pa.template === pb.template) {
    return pa.template.replace('__N__', (pa.num + pb.num).toFixed(2));
  }
  return `${a} + ${b}`;
}
