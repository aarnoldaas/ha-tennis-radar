import { afterEach, expect, it, vi } from 'vitest';
import { scanDateBounds, scanDatePlan } from '../src/utils/scan-dates.js';
import { SebProvider } from '../src/providers/seb.js';
import { PollingManager } from '../src/polling.js';
const now=new Date('2026-09-09T12:00:00Z');
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('always scans next seven days despite legacy dates and only adds selected future weekdays', () => {
  const legacy = {scan_dates:['2026-09-01','2027-03-09'],seb_future_weekdays:[1]};
  const plan=scanDatePlan(legacy,now);
  expect(plan.near).toEqual(['2026-09-10','2026-09-11','2026-09-12','2026-09-13','2026-09-14','2026-09-15','2026-09-16']);
  expect(plan.future[0]).toBe('2026-09-28');
  expect(plan.future.at(-1)).toBe('2027-03-08');
  expect(plan.future.every(date => new Date(`${date}T12:00:00Z`).getUTCDay() === 1)).toBe(true);
  expect(scanDatePlan({...legacy,seb_future_weekdays:[]},now).future).toEqual([]);
});
it('retains next-seven-day defaults and uses Vilnius calendar dates at midnight and month boundaries', () => {
  expect(scanDatePlan({seb_future_weekdays:[]},now).near).toHaveLength(7);
  expect(scanDateBounds(new Date('2026-09-09T22:30:00Z')).today).toBe('2026-09-10');
  expect(scanDateBounds(new Date('2026-08-31T12:00:00Z')).futureEnd).toBe('2027-02-28');
});
it('fetches future availability in sequential batches of at most seven dates', async () => {
  let active=0;let maxActive=0;
  const fetch=vi.fn().mockImplementation(async()=>{active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;return Response.json({data:[]});});
  vi.stubGlobal('fetch',fetch);
  const dates=Array.from({length:16},(_,i)=>`2027-01-${String(i+1).padStart(2,'0')}`);
  expect(await new SebProvider('test').getAvailability(dates)).toEqual([]);
  expect(fetch.mock.calls.map(([,init])=>JSON.parse(init.body).dates)).toEqual([dates.slice(0,7),dates.slice(7,14),dates.slice(14)]);
  expect(maxActive).toBe(1);
});
it('extends the existing booking check to a selected far-future date', async () => {
  vi.useFakeTimers();vi.setSystemTime(now);
  const fetch=vi.fn().mockResolvedValue(Response.json({data:{results:[]}}));vi.stubGlobal('fetch',fetch);
  await new SebProvider('test').getBookings('2027-05-01');
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('to')).toBe('2027-05-01');
});
it('independent future polling runs once per two hours while near polling continues', async () => {
  vi.useFakeTimers();
  const near=vi.fn().mockResolvedValue(undefined);const future=vi.fn().mockResolvedValue(undefined);
  const nearPoller=new PollingManager(near,{intervalMs:30_000});
  const futurePoller=new PollingManager(future,{intervalMs:2*60*60_000,maxBackoffMs:24*60*60_000});
  nearPoller.start();futurePoller.start();
  await vi.advanceTimersByTimeAsync(2*60*60_000-1);
  expect(future).toHaveBeenCalledTimes(1);expect(near.mock.calls.length).toBeGreaterThan(1);
  await vi.advanceTimersByTimeAsync(1);expect(future).toHaveBeenCalledTimes(2);
  await Promise.all([nearPoller.stop(),futurePoller.stop()]);
});
