import { expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanDatePlan } from '../src/utils/scan-dates.js';
it('persists selected dates without an automatic scan fallback and preserves future weekdays', async () => {
  const dir = mkdtempSync(join(tmpdir(),'tennis-config-'));
  vi.stubEnv('DATA_DIR',dir);
  vi.resetModules();
  try {
    writeFileSync(join(dir,'config.json'),JSON.stringify({scan_dates:['2027-02-10'],seb_future_weekdays:[1,5],seb_future_interval_hours:2}));
    const {loadOptions,saveOptions,validateConfig} = await import('../src/utils/config.js');
    const options = loadOptions();
    expect(options.scan_dates).toEqual(['2027-02-10']);
    expect(options.seb_future_weekdays).toEqual([1,5]);
    expect(scanDatePlan(options,new Date('2026-09-09T12:00:00Z')).near).toEqual([]);
    saveOptions({...options,...{scan_dates:['2027-02-10']}});
    expect(JSON.parse(readFileSync(join(dir,'config.json'),'utf8')).scan_dates).toEqual(['2027-02-10']);
    expect(validateConfig(options).some(w => w.field === 'notify_device')).toBe(true);
  } finally {vi.unstubAllEnvs(); vi.resetModules(); rmSync(dir,{recursive:true,force:true});}
});
