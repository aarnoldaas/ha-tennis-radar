import { venueDateTime } from './utils/venue-time.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Booking } from './providers/types.js';

const DATA_DIR = process.env.DATA_DIR || '/data';
const STATE_PATH = `${DATA_DIR}/booking-reminders.json`;

export interface ReminderThreshold {
  name: string;
  hours: number;
  label: string;
}

// Ordered ascending by hours so the most-imminent applicable threshold wins.
export const REMINDER_THRESHOLDS: ReminderThreshold[] = [
  { name: '49h', hours: 49, label: '49 hours' },
  { name: '3d', hours: 72, label: '3 days' },
  { name: '7d', hours: 168, label: '1 week' },
];

export interface BookingReminder {
  booking: Booking;
  threshold: ReminderThreshold;
  hoursUntil: number;
}

interface SentEntry {
  date: string;
  startTime: string;
  sent: string[];
}

export function bookingKey(b: Booking): string {
  // Pipe-delimited because court names can contain colons (e.g. SEB "Court 5 (clay): outdoor")
  return [b.provider, b.courtName, b.date, b.startTime].join('|');
}

export function bookingStartDate(b: Booking): Date | null {
  const md = b.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mt = b.startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!md || !mt) return null;
  const wallClock = Date.UTC(Number(md[1]), Number(md[2])-1, Number(md[3]), Number(mt[1]), Number(mt[2]));
  let instant = wallClock;
  const formatter = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Vilnius',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  // Resolve the venue's wall-clock time, including daylight-saving changes.
  for (let i=0;i<3;i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));
    const rendered = Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));
    const difference = wallClock-rendered;
    instant += difference;
    if (!difference) return new Date(instant);
  }
  return null;
}

/**
 * Tracks which booking-reminder thresholds have already fired so each booking
 * gets at most one notification per threshold across restarts.
 */
export class BookingReminderManager {
  private state = new Map<string, SentEntry>();

  constructor(private statePath = STATE_PATH) {
    this.load();
  }

  /**
   * Returns reminders that should be sent now and updates internal state so the
   * same threshold won't fire again. Persists state on every change.
   */
  check(bookings: Booking[], now: Date = new Date()): BookingReminder[] {
    const today = todayLocal(now);
    let changed = false;

    for (const [key, entry] of [...this.state]) {
      if (entry.date < today) {
        this.state.delete(key);
        changed = true;
      }
    }

    const due: BookingReminder[] = [];
    const ascending = [...REMINDER_THRESHOLDS].sort((a, b) => a.hours - b.hours);

    for (const booking of bookings) {
      const start = bookingStartDate(booking);
      if (!start) continue;

      const hoursUntil = (start.getTime() - now.getTime()) / 3_600_000;
      if (hoursUntil <= 0) continue;

      const applicable = ascending.find(t => hoursUntil <= t.hours);
      if (!applicable) continue;

      const key = bookingKey(booking);
      const entry = this.state.get(key) ?? {
        date: booking.date,
        startTime: booking.startTime,
        sent: [],
      };

      if (entry.sent.includes(applicable.name)) continue;

      due.push({ booking, threshold: applicable, hoursUntil });

      // Consume this threshold and any earlier (longer-horizon) thresholds we
      // skipped past — otherwise they'd fire on a later check when hoursUntil
      // is even smaller.
      const sent = new Set(entry.sent);
      for (const t of ascending) {
        if (t.hours >= applicable.hours) sent.add(t.name);
      }
      entry.sent = [...sent];
      this.state.set(key, entry);
      changed = true;
    }

    if (changed) this.save();
    return due;
  }

  private load(): void {
    if (!existsSync(this.statePath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.statePath, 'utf-8')) as Record<string, SentEntry>;
      for (const [key, entry] of Object.entries(raw)) {
        if (entry && typeof entry.date === 'string' && Array.isArray(entry.sent)) {
          this.state.set(key, {
            date: entry.date,
            startTime: entry.startTime ?? '',
            // Migrate the legacy '47h' threshold name to '49h' so previously-sent
            // reminders aren't re-fired after the rename.
            sent: entry.sent.map(name => (name === '47h' ? '49h' : name)),
          });
        }
      }
      console.log(`[BookingReminders] Loaded ${this.state.size} entry/entries from ${this.statePath}`);
    } catch (err) {
      console.warn('[BookingReminders] Failed to load state, starting fresh:', err);
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.statePath), { recursive: true });
      const obj: Record<string, SentEntry> = {};
      for (const [key, entry] of this.state) obj[key] = entry;
      writeFileSync(this.statePath, JSON.stringify(obj, null, 2));
    } catch (err) {
      console.warn('[BookingReminders] Failed to save state:', err);
    }
  }
}

function todayLocal(now: Date): string {
  return venueDateTime(now).date;
}
