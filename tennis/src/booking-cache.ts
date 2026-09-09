import type { Booking } from './providers/types.js';

export const BOOKING_REFRESH_INTERVAL_MS = 60 * 60_000;
type BookingResult = { bookings: Booking[]; errors: string[] };

/** Shared by future scans, the bookings page, and reminders. Cache failures too
 * so a provider outage cannot turn frequent consumers into repeated requests. */
export class BookingCache {
  private cached: BookingResult | undefined;
  private refreshedAt = 0;
  private pending: Promise<BookingResult> | undefined;

  constructor(private fetchBookings: () => Promise<BookingResult>) {}

  get refreshInMs(): number {
    return this.cached ? Math.max(0, BOOKING_REFRESH_INTERVAL_MS - (Date.now() - this.refreshedAt)) : 0;
  }

  get(): Promise<BookingResult> {
    if (this.pending) return this.pending;
    if (this.cached && Date.now() - this.refreshedAt < BOOKING_REFRESH_INTERVAL_MS) {
      return Promise.resolve(this.cached);
    }
    this.pending = Promise.resolve().then(() => this.fetchBookings())
      .catch((error: unknown) => ({bookings: [], errors: [error instanceof Error ? error.message : String(error)]}))
      .then(result => {
        this.cached = result;
        this.refreshedAt = Date.now();
        return result;
      }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
}
