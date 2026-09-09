import type { TimeSlot } from './types.js';
import type { AddonOptions } from '../utils/config.js';
const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const time = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

/** Intersect continuous availability with the requested booking window. */
export function matchingSlots(slots: TimeSlot[], options: AddonOptions): TimeSlot[] {
  return slots.flatMap(slot => {
    const start = Math.max(minutes(slot.startTime), minutes(options.preferred_start_time));
    const end = Math.min(minutes(slot.endTime), minutes(options.preferred_end_time));
    if (slot.status !== 'available' || end - start < options.preferred_duration_minutes) return [];
    return [{...slot, startTime: time(start), endTime: time(end), durationMinutes: end - start}];
  });
}

export function rankSebCourts(slots: TimeSlot[]): TimeSlot[] {
  // Court IDs are API identifiers; rank the displayed indoor court number.
  const number = (slot: TimeSlot) => Number(slot.courtName.match(/^SEB\s*0?(\d{1,2})(?:\D|$)/i)?.[1] ?? 0);
  return slots.filter(s => s.provider === 'SEB').sort((a, b) =>
    number(b) - number(a) || a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId));
}

export function bookingSlot(slot: TimeSlot, duration: number): TimeSlot {
  return {...slot, endTime: time(minutes(slot.startTime) + duration), durationMinutes: duration};
}
