import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BookingReminderManager, bookingStartDate } from '../src/booking-reminders.js';
import type { Booking } from '../src/providers/types.js';
let dir: string;
const booking: Booking = {provider:'SEB',courtName:'SEB 21',date:'2026-09-16',startTime:'13:00',endTime:'14:00',durationMinutes:60};
beforeEach(() => {dir=mkdtempSync(join(tmpdir(),'tennis-reminders-'));});
afterEach(() => rmSync(dir,{recursive:true,force:true}));
it('sends a one-week reminder once across restart, then retains 3-day and 49-hour reminders', () => {
  const path=join(dir,'state.json');
  const manager=new BookingReminderManager(path);
  expect(manager.check([booking],new Date('2026-09-09T12:59:00+03:00'))).toEqual([]);
  expect(manager.check([booking],new Date('2026-09-09T13:00:00+03:00')).map(r=>r.threshold.name)).toEqual(['7d']);
  const restarted=new BookingReminderManager(path);
  expect(restarted.check([booking],new Date('2026-09-09T13:30:00+03:00'))).toEqual([]);
  expect(restarted.check([booking],new Date('2026-09-13T13:00:00+03:00')).map(r=>r.threshold.name)).toEqual(['3d']);
  expect(restarted.check([booking],new Date('2026-09-14T12:00:00+03:00')).map(r=>r.threshold.name)).toEqual(['49h']);
});
it('does not send old one-week reminders when the addon starts close to a booking', () => {
  const manager=new BookingReminderManager(join(dir,'state.json'));
  expect(manager.check([booking],new Date('2026-09-14T13:00:00+03:00')).map(r=>r.threshold.name)).toEqual(['49h']);
  expect(manager.check([booking],new Date('2026-09-14T13:30:00+03:00'))).toEqual([]);
});

it('resolves venue time in summer and winter independently of the server timezone', () => {
  expect(bookingStartDate(booking)?.toISOString()).toBe('2026-09-16T10:00:00.000Z');
  expect(bookingStartDate({...booking,date:'2026-11-16'})?.toISOString()).toBe('2026-11-16T11:00:00.000Z');
});
