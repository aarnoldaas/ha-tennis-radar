import type { AddonOptions } from '../utils/config.js';
import type { ICourtProvider, TimeSlot, Booking } from './types.js';
import { SebProvider } from './seb.js';
import { BalticTennisProvider } from './baltic-tennis.js';

export interface ProviderErrorInfo {
  provider: string;
  date: string;
  error: string;
  time: string;
}

export interface CheckResult {
  slots: TimeSlot[];
  errors: ProviderErrorInfo[];
}

export class CourtProviderManager {
  private providers: ICourtProvider[] = [];
  private disabledProviders = new Set<string>();

  constructor(options: AddonOptions) {
    if (options.seb_enabled && options.seb_session_token) {
      this.providers.push(new SebProvider(options.seb_session_token));
    }
    if (options.baltic_tennis_enabled) {
      this.providers.push(new BalticTennisProvider(options.baltic_tennis_username, options.baltic_tennis_password));
    }

    console.log(`[ProviderManager] Initialized ${this.providers.length} provider(s): ${this.providers.map(p => p.name).join(', ') || 'none'}`);
  }

  async checkAll(dates: string[]): Promise<CheckResult> {
    const allSlots: TimeSlot[] = [];
    const errors: ProviderErrorInfo[] = [];
    const activeProviders = this.providers.filter(p => !this.disabledProviders.has(p.name));

    if (activeProviders.length === 0) {
      console.warn(`[ProviderManager] No active providers — all disabled due to errors`);
      return { slots: [], errors: [] };
    }

    console.log(`[ProviderManager] Fetching available courts for ${dates.length} date(s): ${dates.join(', ')} (${activeProviders.length} active provider(s))`);

    for (const date of dates) {
      const results = await Promise.allSettled(
        activeProviders.map(p => {
          console.log(`[ProviderManager] Querying ${p.name} for date ${date}`);
          return p.getAvailability(date);
        }),
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const provider = activeProviders[i];
        if (result.status === 'fulfilled') {
          console.log(`[ProviderManager] ${provider.name} returned ${result.value.length} slot(s) for ${date}`);
          allSlots.push(...result.value);
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error(`[ProviderManager] ${provider.name} failed for ${date}: ${errMsg} — disabling provider`);
          this.disabledProviders.add(provider.name);
          errors.push({
            provider: provider.name,
            date,
            error: errMsg,
            time: new Date().toISOString(),
          });
        }
      }
    }

    console.log(`[ProviderManager] Total: ${allSlots.length} available slot(s) across all providers and dates`);
    return { slots: allSlots, errors };
  }

  resumeProvider(name: string): boolean {
    if (this.disabledProviders.has(name)) {
      this.disabledProviders.delete(name);
      console.log(`[ProviderManager] Resumed provider: ${name}`);
      return true;
    }
    return false;
  }

  resumeAll(): void {
    this.disabledProviders.clear();
    console.log(`[ProviderManager] Resumed all providers`);
  }

  async fetchBookings(): Promise<{ bookings: Booking[]; errors: string[] }> {
    const allBookings: Booking[] = [];
    const errors: string[] = [];

    for (const provider of this.providers) {
      if (!provider.getBookings) continue;
      try {
        const bookings = await provider.getBookings();
        allBookings.push(...bookings);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ProviderManager] ${provider.name} bookings failed:`, msg);
        errors.push(`${provider.name}: ${msg}`);
      }
    }

    allBookings.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    return { bookings: allBookings, errors };
  }

  get disabledProviderNames(): string[] {
    return [...this.disabledProviders];
  }

  get providerCount(): number {
    return this.providers.length;
  }

  disposeAll(): void {
    this.providers = [];
    this.disabledProviders.clear();
  }
}
