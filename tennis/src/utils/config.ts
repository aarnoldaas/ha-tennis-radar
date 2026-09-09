import { scanDatePlan } from './scan-dates.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { normalizeSebPlaces } from '../providers/seb-places.js';

export interface AddonOptions {
  poll_interval_seconds: number;
  scan_dates: string[];
  seb_future_weekdays: number[];
  seb_future_interval_hours: number;
  preferred_start_time: string;
  preferred_end_time: string;
  preferred_duration_minutes: number;
  notify_device: string;
  seb_enabled: boolean;
  seb_session_token: string;
  seb_places: number[];
  baltic_tennis_enabled: boolean;
  baltic_tennis_username: string;
  baltic_tennis_password: string;
  debug: boolean;
}

const DATA_DIR = process.env.DATA_DIR || '/data';
const CONFIG_PATH = `${DATA_DIR}/config.json`;

const DEFAULTS: AddonOptions = {
  poll_interval_seconds: 30,
  scan_dates: [],
  seb_future_weekdays: [],
  seb_future_interval_hours: 2,
  preferred_start_time: '17:00',
  preferred_end_time: '21:00',
  preferred_duration_minutes: 60,
  notify_device: '',
  seb_enabled: true,
  seb_session_token: '',
  seb_places: [2, 18],
  baltic_tennis_enabled: true,
  baltic_tennis_username: '',
  baltic_tennis_password: '',
  debug: false,
};

// Migrate old teniso_pasaulis_* keys to seb_* and drop unknown/legacy fields
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
  result.scan_dates = Array.isArray(result.scan_dates)
    ? [...new Set(result.scan_dates.filter((date: unknown) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)))] : [];
  delete result['night_poll_interval_seconds'];
  delete result['baltic_tennis_session_token'];
  if ('teniso_pasaulis_places' in result && !('seb_places' in result)) {
    result['seb_places'] = result['teniso_pasaulis_places'];
  }
  delete result['teniso_pasaulis_sale_point'];
  delete result['teniso_pasaulis_places'];
  delete result['seb_sale_point'];
  delete result['baltic_tennis_place_ids'];
  delete result['alpha_vantage_api_key'];
  delete result['anthropic_api_key'];
  delete result['todo_entity_id'];
  result.seb_future_weekdays = Array.isArray(result.seb_future_weekdays)
    ? [...new Set(result.seb_future_weekdays.filter((day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6))] : [];
  if (!Number.isInteger(result.seb_future_interval_hours) || result.seb_future_interval_hours < 1 || result.seb_future_interval_hours > 24) result.seb_future_interval_hours = 2;
  return result;
}

export function loadOptions(): AddonOptions {
  if (existsSync(CONFIG_PATH)) {
    try {
      const saved = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      const migrated = migrateKeys(saved);
      return { ...DEFAULTS, ...migrated, seb_places: normalizeSebPlaces(migrated.seb_places) };
    } catch {
      console.warn('[Config] Failed to parse config.json, using defaults');
    }
  }

  try {
    const haOptions = JSON.parse(readFileSync(`${DATA_DIR}/options.json`, 'utf-8'));
    const migrated = migrateKeys(haOptions);
    return { ...DEFAULTS, ...migrated, seb_places: normalizeSebPlaces(migrated.seb_places) };
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

  if (!scanDatePlan(opts).near.length) {
    warnings.push({field: 'scan_dates', message: 'Near-term scanning is off: select dates in the next two weeks in Settings and save. Expired dates are not scanned.'});
  }

  if (!opts.notify_device.trim()) {
    warnings.push({ field: 'notify_device', message: 'No mobile notification device configured — alerts appear only in the Home Assistant notification panel' });
  }

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

  if (opts.seb_enabled && normalizeSebPlaces(opts.seb_places).length === 0) {
    warnings.push({ field: 'seb_places', message: 'SEB Arena is enabled but no court groups are selected' });
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
  writeFileSync(CONFIG_PATH, JSON.stringify(migrateKeys(options), null, 2));
}

export function getEffectiveIntervalMs(opts: AddonOptions): number {
  return opts.poll_interval_seconds * 1000;
}
