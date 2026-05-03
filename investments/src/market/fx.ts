import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FX service. Base currency is EUR. Rates are expressed as "units of target
 * per 1 EUR" (EUR → X). Source: the ECB reference-rate XML feed.
 *
 *   https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml     (full)
 *   https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml (recent)
 *
 * On first successful fetch we grab the full history so cost basis of trades
 * back to 2000 can be translated at the correct historical rate. Subsequent
 * refreshes pull the 90-day slice, which is tiny and keeps the tail current.
 *
 * Cached to `<dataDir>/fx-cache.json`.
 */

const ECB_HIST_FULL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml';
const ECB_HIST_90D = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';

interface FxCache {
  asOf: string;
  rates: Record<string, Record<string, number>>;
  dates: string[];
}

export class FxService {
  private readonly cachePath: string;
  private cache: FxCache;
  private readonly maxAgeMs: number;

  constructor(dataDir: string, maxAgeMs = 12 * 60 * 60 * 1000) {
    this.cachePath = join(dataDir, 'fx-cache.json');
    this.maxAgeMs = maxAgeMs;
    this.cache = existsSync(this.cachePath)
      ? JSON.parse(readFileSync(this.cachePath, 'utf-8'))
      : { asOf: '1970-01-01T00:00:00.000Z', rates: {}, dates: [] };
    if (!this.cache.dates) this.cache.dates = Object.keys(this.cache.rates).sort();
  }

  private save(): void {
    try {
      writeFileSync(this.cachePath, JSON.stringify(this.cache));
    } catch {
      /* non-fatal */
    }
  }

  private isFresh(): boolean {
    return Date.now() - new Date(this.cache.asOf).getTime() < this.maxAgeMs;
  }

  async refresh(): Promise<void> {
    if (this.isFresh() && this.cache.dates.length > 0) return;

    const url = this.cache.dates.length === 0 ? ECB_HIST_FULL : ECB_HIST_90D;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const xml = await res.text();
      const merged = { ...this.cache.rates };
      for (const day of parseEcbXml(xml)) {
        merged[day.date] = day.rates;
      }
      const dates = Object.keys(merged).sort();
      this.cache = { asOf: new Date().toISOString(), rates: merged, dates };
      this.save();
    } catch {
      /* non-fatal */
    }
  }

  private findDate(date: string): string | null {
    const { dates } = this.cache;
    if (dates.length === 0) return null;
    let lo = 0;
    let hi = dates.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (dates[mid] <= date) lo = mid;
      else hi = mid - 1;
    }
    return dates[lo] <= date ? dates[lo] : dates[0];
  }

  /** Rate such that `1 EUR = rate * target`, on or before `date`. */
  rateOn(target: string, date: string): number {
    const ccy = aliasCurrency(target);
    if (ccy === 'EUR') return 1;
    const chosen = this.findDate(date);
    if (!chosen) return 1;
    const r = this.cache.rates[chosen]?.[ccy];
    return Number.isFinite(r) && r && r > 0 ? r : 1;
  }

  latestRate(target: string): number {
    const ccy = aliasCurrency(target);
    if (ccy === 'EUR') return 1;
    const { dates } = this.cache;
    if (dates.length === 0) return 1;
    const last = dates[dates.length - 1];
    const r = this.cache.rates[last]?.[ccy];
    return Number.isFinite(r) && r && r > 0 ? r : 1;
  }

  /** Convert `amount` from `fromCurrency` to EUR on `date`. */
  toBase(amount: number, fromCurrency: string, date: string): number {
    const rate = this.rateOn(fromCurrency, date);
    return amount / rate;
  }

  toBaseLatest(amount: number, fromCurrency: string): number {
    const rate = this.latestRate(fromCurrency);
    return amount / rate;
  }
}

/**
 * Some brokers use "offshore" currency codes (e.g. IB's CNH for offshore
 * renminbi) that the ECB does not publish directly. Map them to the closest
 * published ECB ticker — for CNH the rate is almost identical to CNY.
 */
function aliasCurrency(raw: string): string {
  const ccy = raw.toUpperCase();
  switch (ccy) {
    case 'CNH':
      return 'CNY';
    case 'GBX':
      return 'GBP';
    default:
      return ccy;
  }
}

/**
 * ECB XML shape is:
 *   <Cube>
 *     <Cube time="YYYY-MM-DD">
 *       <Cube currency="USD" rate="1.0871"/>
 *       ...
 *     </Cube>
 *     ...
 *   </Cube>
 *
 * Not bothering with a full XML parser — a tiny regex stream is perfectly
 * safe here since the feed is strictly structured and attribute order is
 * stable across years.
 */
function parseEcbXml(xml: string): Array<{ date: string; rates: Record<string, number> }> {
  const out: Array<{ date: string; rates: Record<string, number> }> = [];
  const dayRe = /<Cube\s+time="(\d{4}-\d{2}-\d{2})"\s*>([\s\S]*?)<\/Cube>/g;
  const rateRe = /<Cube\s+currency="([A-Z]{3})"\s+rate="([\d.]+)"\s*\/>/g;

  let m: RegExpExecArray | null;
  while ((m = dayRe.exec(xml)) !== null) {
    const date = m[1];
    const rates: Record<string, number> = { EUR: 1 };
    const body = m[2];
    let rm: RegExpExecArray | null;
    while ((rm = rateRe.exec(body)) !== null) {
      const v = Number(rm[2]);
      if (Number.isFinite(v) && v > 0) rates[rm[1]] = v;
    }
    out.push({ date, rates });
  }
  return out;
}
