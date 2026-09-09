import { expect, it, vi } from 'vitest';
import { checkFutureAvailability } from '../src/future-scan.js';
import type { Booking } from '../src/providers/types.js';
const dates=['2026-10-01','2026-10-02','2026-10-03'];
const booking = (date: string, provider: 'SEB' | 'BT'): Booking => ({date,provider,courtName:'Court',startTime:'08:00',endTime:'09:00',durationMinutes:60});
it('excludes dates booked at either provider, regardless of booking time, before availability requests', async () => {
  const fetch=vi.fn().mockResolvedValue({bookings:[booking(dates[0],'SEB'),booking(dates[1],'BT')],errors:[]});
  const check=vi.fn().mockResolvedValue({slots:[],errors:[]});
  const result=await checkFutureAvailability(dates,fetch,check);
  expect(fetch).toHaveBeenCalledWith(dates[2]);
  expect(check).toHaveBeenCalledExactlyOnceWith([dates[2]]);
  expect(result.skippedDates).toEqual(dates.slice(0,2));
});
it('makes no availability requests when every selected date is booked', async () => {
  const check=vi.fn();
  const result=await checkFutureAvailability(dates,async()=>({bookings:dates.map(date=>booking(date,'SEB')),errors:[]}),check);
  expect(check).not.toHaveBeenCalled();
  expect(result.result.slots).toEqual([]);
  expect(result.dates).toEqual([]);
});
it('refreshes bookings each scan so a cancelled booking allows that date again', async () => {
  const fetch=vi.fn().mockResolvedValueOnce({bookings:[booking(dates[0],'SEB')],errors:[]}).mockResolvedValue({bookings:[],errors:[]});
  const check=vi.fn().mockResolvedValue({slots:[],errors:[]});
  await checkFutureAvailability(dates,fetch,check);
  await checkFutureAvailability(dates,fetch,check);
  expect(check).toHaveBeenNthCalledWith(1,dates.slice(1));
  expect(check).toHaveBeenNthCalledWith(2,dates);
});
it('defers availability on partial booking lookup failure', async () => {
  const check=vi.fn();
  await expect(checkFutureAvailability(dates,async()=>({bookings:[],errors:['SEB: session expired']}),check)).rejects.toThrow('future scan deferred');
  expect(check).not.toHaveBeenCalled();
});
