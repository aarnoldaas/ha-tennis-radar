import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

export interface AddonOptions {
  anthropic_api_key: string;
  debug: boolean;
}

const DATA_DIR = process.env.DATA_DIR || '/data';
const CONFIG_PATH = `${DATA_DIR}/config.json`;

const DEFAULTS: AddonOptions = {
  anthropic_api_key: '',
  debug: false,
};

function pickKnown(obj: Record<string, any>): Partial<AddonOptions> {
  const result: Partial<AddonOptions> = {};
  if (typeof obj.anthropic_api_key === 'string') result.anthropic_api_key = obj.anthropic_api_key;
  if (typeof obj.debug === 'boolean') result.debug = obj.debug;
  return result;
}

export function loadOptions(): AddonOptions {
  if (existsSync(CONFIG_PATH)) {
    try {
      const saved = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      return { ...DEFAULTS, ...pickKnown(saved) };
    } catch {
      console.warn('[Config] Failed to parse config.json, using defaults');
    }
  }

  try {
    const haOptions = JSON.parse(readFileSync(`${DATA_DIR}/options.json`, 'utf-8'));
    return { ...DEFAULTS, ...pickKnown(haOptions) };
  } catch {
    // No HA options either — use defaults
  }

  return { ...DEFAULTS };
}

export function saveOptions(options: AddonOptions): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(options, null, 2));
}
