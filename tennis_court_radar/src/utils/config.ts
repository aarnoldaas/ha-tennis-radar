import { readFileSync } from 'node:fs';

export interface AddonOptions {
  poll_interval_seconds: number;
  scan_dates: string[];
  preferred_start_time: string;
  preferred_end_time: string;
  preferred_duration_minutes: number;
  notify_device: string;
  teniso_pasaulis_enabled: boolean;
  teniso_pasaulis_session_token: string;
  teniso_pasaulis_sale_point: number;
  teniso_pasaulis_places: string;
  baltic_tennis_enabled: boolean;
  baltic_tennis_place_ids: number[];
  debug: boolean;
}

export function loadOptions(): AddonOptions {
  return JSON.parse(readFileSync('/data/options.json', 'utf-8'));
}

/**
 * If scan_dates is empty, generate dates for the next 7 days.
 */
export function getEffectiveDates(scanDates: string[]): string[] {
  if (scanDates.length > 0) return scanDates;

  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
