import { afterEach, expect, it, vi } from 'vitest';
import { scanDateBounds, scanDatePlan } from '../src/utils/scan-dates.js';
import { SebProvider } from '../src/providers/seb.js';
import { PollingManager } from '../src/polling.js';
const now=new Date('2026-09-09T12:00:00Z');
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('scans only selected dates within the next two weeks and separately adds future weekdays', () => {
  const legacy = {scan_dates:['2026-09-01','2026-09-09','2026-09-10','2026-09-23','2026-09-23','2026-09-24','2027-03-09'],seb_future_weekdays:[1]};
  const plan=scanDatePlan(legacy,now);
  expect(plan.near).toEqual(['2026-09-10','2026-09-23']);
  expect(plan.future[0]).toBe('2026-09-28');
  expect(plan.future.at(-1)).toBe('2027-03-08');
  expect(plan.future.every(date => new Date(`${date}T12:00:00Z`).getUTCDay() === 1)).toBe(true);
  expect(scanDatePlan({...legacy,seb_future_weekdays:[]},now).future).toEqual([]);
});
it('does not scan near-term dates without a selection and uses Vilnius calendar boundaries', () => {
  expect(scanDatePlan({scan_dates:[],seb_future_weekdays:[]},now).near).toEqual([]);
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

it('pauses two seconds between future batches, with no initial or final pause', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockImplementation(async () => Response.json({data: []}));
  vi.stubGlobal('fetch', fetch);
  const dates = Array.from({length: 16}, (_, i) => `2027-01-${String(i + 1).padStart(2, '0')}`);
  const scan = new SebProvider('test', undefined, 2_000).getAvailability(dates);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1_999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1_999);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(await scan).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([1, 3, 6, 12])('limits future scanning to the configured %i months', months => {
  const options = {scan_dates: ['2026-09-10'], seb_future_weekdays: [0,1,2,3,4,5,6], seb_future_months: months};
  const plan = scanDatePlan(options, now);
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + months);
  expect(plan.future[0]).toBe('2026-09-24');
  expect(plan.future.at(-1)).toBe(end.toISOString().slice(0,10));
  expect(plan.near).toEqual(['2026-09-10']);
});

it('clamps configurable horizons at month-end and across leap years', () => {
  expect(scanDateBounds(new Date('2026-01-31T12:00:00Z'), 1).futureEnd).toBe('2026-02-28');
  expect(scanDateBounds(new Date('2028-01-31T12:00:00Z'), 1).futureEnd).toBe('2028-02-29');
  expect(scanDateBounds(new Date('2028-02-29T12:00:00Z'), 12).futureEnd).toBe('2029-02-28');
});
