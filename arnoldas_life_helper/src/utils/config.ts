import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

export interface AddonOptions {
  poll_interval_seconds: number;
  scan_dates: string[];
  preferred_start_time: string;
  preferred_end_time: string;
  preferred_duration_minutes: number;
  notify_device: string;
  seb_enabled: boolean;
  seb_session_token: string;
  baltic_tennis_enabled: boolean;
  baltic_tennis_username: string;
  baltic_tennis_password: string;
  debug: boolean;
  anthropic_api_key: string;
}

const DATA_DIR = process.env.DATA_DIR || '/data';
const CONFIG_PATH = `${DATA_DIR}/config.json`;

const DEFAULTS: AddonOptions = {
  poll_interval_seconds: 30,
  scan_dates: [],
  preferred_start_time: '17:00',
  preferred_end_time: '21:00',
  preferred_duration_minutes: 60,
  notify_device: '',
  seb_enabled: true,
  seb_session_token: '',
  baltic_tennis_enabled: true,
  baltic_tennis_username: '',
  baltic_tennis_password: '',
  debug: false,
  anthropic_api_key: '',
};

// Migrate old teniso_pasaulis_* keys to seb_*
function migrateKeys(obj: Record<string, any>): Record<string, any> {
  const map: Record<string, string> = {
    teniso_pasaulis_enabled: 'seb_enabled',
    teniso_pasaulis_session_token: 'seb_session_token',
  };
  const result = { ...obj };
  for (const [oldKey, newKey] of Object.entries(map)) {
    if (oldKey in result && !(newKey in result)) {
      result[newKey] = result[oldKey];
    }
    delete result[oldKey];
  }
  // Remove deprecated fields
  delete result['baltic_tennis_session_token'];
  delete result['teniso_pasaulis_sale_point'];
  delete result['teniso_pasaulis_places'];
  delete result['seb_sale_point'];
  delete result['seb_places'];
  delete result['baltic_tennis_place_ids'];
  return result;
}

export function loadOptions(): AddonOptions {
  // If UI config exists, use it
  if (existsSync(CONFIG_PATH)) {
    try {
      const saved = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      return { ...DEFAULTS, ...migrateKeys(saved) };
    } catch {
      console.warn('[Config] Failed to parse config.json, using defaults');
    }
  }

  // Fall back to HA add-on options for initial migration
  try {
    const haOptions = JSON.parse(readFileSync(`${DATA_DIR}/options.json`, 'utf-8'));
    return { ...DEFAULTS, ...migrateKeys(haOptions) };
  } catch {
    // No HA options either — use defaults
  }

  return { ...DEFAULTS };
}

export interface ConfigWarning {
  field: string;
  message: string;
}

export function validateConfig(opts: AddonOptions): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  if (opts.poll_interval_seconds < 10) {
    warnings.push({ field: 'poll_interval_seconds', message: 'Poll interval must be at least 10 seconds' });
  }

  if (opts.preferred_start_time >= opts.preferred_end_time) {
    warnings.push({ field: 'preferred_start_time', message: 'Start time must be before end time' });
  }

  if (opts.preferred_duration_minutes < 30) {
    warnings.push({ field: 'preferred_duration_minutes', message: 'Minimum duration must be at least 30 minutes' });
  }

  if (!opts.seb_enabled && !opts.baltic_tennis_enabled) {
    warnings.push({ field: 'providers', message: 'No providers enabled — no courts will be fetched' });
  }

  if (opts.seb_enabled && !opts.seb_session_token) {
    warnings.push({ field: 'seb_session_token', message: 'SEB Arena is enabled but session token is missing' });
  }

  if (opts.baltic_tennis_enabled) {
    if (!opts.baltic_tennis_username || !opts.baltic_tennis_password) {
      warnings.push({ field: 'baltic_tennis_username', message: 'Baltic Tennis is enabled but username or password is missing' });
    }
  }

  return warnings;
}

export function saveOptions(options: AddonOptions): void {
  mkdirSync(DATA_DIR, { recursive: true });
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
