import { venueDateTime } from './venue-time.js';

/** Calendar dates use the courts' timezone, independent of the host timezone. */
export function scanDateBounds(now = new Date()) {
  const today = venueDateTime(now).date;
  const base = new Date(`${today}T12:00:00Z`);
  const day = (offset: number) => {const date = new Date(base); date.setUTCDate(date.getUTCDate()+offset); return date.toISOString().slice(0,10);};
  const end = new Date(base);
  const originalDay = end.getUTCDate();
  end.setUTCDate(1); end.setUTCMonth(end.getUTCMonth()+7); end.setUTCDate(0);
  end.setUTCDate(Math.min(originalDay,end.getUTCDate()));
  return {today,tomorrow:day(1),nearEnd:day(14),futureEnd:end.toISOString().slice(0,10),day};
}
export function scanDatePlan(options: {scan_dates: string[]; seb_future_weekdays: number[]}, now = new Date()) {
  const bounds = scanDateBounds(now);
  const available = new Set(Array.from({length:14},(_,i)=>bounds.day(i+1)));
  const near = options.scan_dates.filter(date => available.has(date));
  const future = new Set<string>();
  for (let offset=15; bounds.day(offset)<=bounds.futureEnd; offset++) {
    const date = bounds.day(offset);
    if (options.seb_future_weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) future.add(date);
  }
  return {near:[...new Set(near)].sort(),future:[...future].sort()};
}
