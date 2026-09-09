import type { Booking } from './providers/types.js';
import type { CheckResult } from './providers/manager.js';

/** Refresh bookings before requesting availability, so booked dates never reach SEB. */
export async function checkFutureAvailability(
  dates: string[],
  fetchBookings: (throughDate?: string) => Promise<{bookings: Booking[]; errors: string[]}>,
  checkAvailability: (dates: string[]) => Promise<CheckResult>,
): Promise<{result: CheckResult; dates: string[]; skippedDates: string[]}> {
  if (!dates.length) return {result: {slots: [], errors: []}, dates: [], skippedDates: []};
  const {bookings, errors} = await fetchBookings([...dates].sort().at(-1));
  if (errors.length) throw new Error(`Cannot check existing bookings; future scan deferred: ${errors.join('; ')}`);
  const booked = new Set(bookings.map(booking => booking.date));
  const remaining = dates.filter(date => !booked.has(date));
  return {
    result: remaining.length ? await checkAvailability(remaining) : {slots: [], errors: []},
    dates: remaining,
    skippedDates: dates.filter(date => booked.has(date)),
  };
}
