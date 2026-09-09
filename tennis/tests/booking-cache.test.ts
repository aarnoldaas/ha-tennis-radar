import { afterEach, expect, it, vi } from 'vitest';
import { BookingCache, BOOKING_REFRESH_INTERVAL_MS } from '../src/booking-cache.js';

afterEach(() => vi.useRealTimers());

it('shares concurrent requests and reuses bookings until an hour has elapsed', async () => {
  vi.useFakeTimers();
  const result = {bookings: [], errors: []};
  const fetch = vi.fn().mockResolvedValue(result);
  const cache = new BookingCache(fetch);
  await Promise.all([cache.get(), cache.get(), cache.get()]);
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(BOOKING_REFRESH_INTERVAL_MS - 1);
  expect(await cache.get()).toBe(result);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(cache.refreshInMs).toBe(1);
  vi.advanceTimersByTime(1);
  await cache.get();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('shares failed lookups until the next hourly retry, then recovers', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({bookings: [], errors: []});
  const cache = new BookingCache(fetch);
  expect((await cache.get()).errors).toEqual(['offline']);
  expect((await cache.get()).errors).toEqual(['offline']);
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(BOOKING_REFRESH_INTERVAL_MS);
  expect((await cache.get()).errors).toEqual([]);
});
