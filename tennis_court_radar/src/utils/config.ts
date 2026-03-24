import { readFileSync, writeFileSync, existsSync } from 'node:fs';

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
  baltic_tennis_session_token: string;
  baltic_tennis_place_ids: string;
  debug: boolean;
}

const CONFIG_PATH = '/data/config.json';

const DEFAULTS: AddonOptions = {
  poll_interval_seconds: 30,
  scan_dates: [],
  preferred_start_time: '17:00',
  preferred_end_time: '21:00',
  preferred_duration_minutes: 60,
  notify_device: '',
  teniso_pasaulis_enabled: true,
  teniso_pasaulis_session_token: '',
  teniso_pasaulis_sale_point: 1,
  teniso_pasaulis_places: '',
  baltic_tennis_enabled: true,
  baltic_tennis_session_token: '',
  baltic_tennis_place_ids: '1',
  debug: false,
};

export function loadOptions(): AddonOptions {
  // If UI config exists, use it
  if (existsSync(CONFIG_PATH)) {
    try {
      const saved = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      return { ...DEFAULTS, ...saved };
    } catch {
      console.warn('[Config] Failed to parse config.json, using defaults');
    }
  }

  // Fall back to HA add-on options for initial migration
  try {
    const haOptions = JSON.parse(readFileSync('/data/options.json', 'utf-8'));
    return { ...DEFAULTS, ...haOptions };
  } catch {
    // No HA options either — use defaults
  }

  return { ...DEFAULTS };
}

export function saveOptions(options: AddonOptions): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(options, null, 2));
}

/**
 * If scan_dates is empty, generate dates for the next 7 days.
 */
export function getEffectiveDates(scanDates: string[]): string[] {
  if (scanDates.length > 0) return scanDates;

  const dates: string[] = [];
  const now = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
