import { afterEach, expect, it, vi } from 'vitest';
import { venueDateTime } from '../src/utils/venue-time.js';
import { scanDateBounds, scanDatePlan } from '../src/utils/scan-dates.js';
import { loadOptions, validateConfig } from '../src/utils/config.js';
afterEach(() => vi.restoreAllMocks());
it('starts config validation and scanning when Swedish date formatting falls back to English', () => {
  const Original = Intl.DateTimeFormat;
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (_locale, options) {
    return new Original('en-US', options);
  } as typeof Intl.DateTimeFormat);
  const now = new Date('2026-09-09T22:30:00Z');
  // Reproduce the old container crash: the localized date is not an ISO date.
  const localized = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Vilnius',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  expect(() => new Date(`${localized}T12:00:00Z`).toISOString()).toThrow(RangeError);
  expect(venueDateTime(now)).toEqual({date:'2026-09-10',time:'01:30'});
  expect(scanDateBounds(now).tomorrow).toBe('2026-09-11');
  expect(scanDatePlan({scan_dates:['2026-09-11'],seb_future_weekdays:[]},now).near).toEqual(['2026-09-11']);
  expect(() => validateConfig(loadOptions())).not.toThrow();
});
it('keeps sortable dates and 24-hour times across winter, midnight and DST changes', () => {
  expect(venueDateTime(new Date('2026-01-01T22:00:00Z'))).toEqual({date:'2026-01-02',time:'00:00'});
  expect(venueDateTime(new Date('2026-03-29T00:30:00Z'))).toEqual({date:'2026-03-29',time:'02:30'});
  expect(venueDateTime(new Date('2026-03-29T01:30:00Z'))).toEqual({date:'2026-03-29',time:'04:30'});
});
