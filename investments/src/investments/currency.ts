// ============================================================================
// Currency Conversion — ECB Reference Rates + Hardcoded Fallback
// ============================================================================

import type { ICurrencyRate } from "./types.js";

// ----------------------------------------------------------------------------
// Rate storage: populated by loadEcbRates() or hardcoded fallback
// ----------------------------------------------------------------------------

/** ECB rates: keyed by currency code (e.g. "USD"), value is array of {date, rate} where 1 EUR = rate units */
const ecbRates = new Map<string, Array<{ date: string; rate: number }>>();
let ecbLoaded = false;

/**
 * Fetch and parse ECB daily reference rates CSV.
 * Populates the in-memory rate lookup. Call at startup and on manual refresh.
 */
export async function loadEcbRates(): Promise<{ loaded: boolean; currencies: number; dates: number }> {
  try {
    const res = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.csv');
    if (!res.ok) throw new Error(`ECB fetch failed: ${res.status}`);
    const text = await res.text();
    return parseEcbCsv(text);
  } catch (err) {
    console.warn(`[Currency] Failed to load ECB rates: ${err instanceof Error ? err.message : err}`);
    console.warn('[Currency] Falling back to hardcoded rates');
    return { loaded: false, currencies: 0, dates: 0 };
  }
}

/**
 * Parse ECB CSV text into the rate lookup.
 * Format: first row is "Date,USD,JPY,..." and subsequent rows are "2024-01-02,1.0950,..."
 */
export function parseEcbCsv(csv: string): { loaded: boolean; currencies: number; dates: number } {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return { loaded: false, currencies: 0, dates: 0 };

  // Header: "Date, USD, JPY, BGN, ..."
  const header = lines[0].split(',').map(h => h.trim());
  const currencyCodes = header.slice(1).filter(h => h.length > 0);

  // Initialize storage
  ecbRates.clear();
  for (const code of currencyCodes) {
    ecbRates.set(code, []);
  }

  let dateCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const date = cols[0].trim();
    if (!date || date === '') continue;

    for (let j = 0; j < currencyCodes.length; j++) {
      const val = cols[j + 1]?.trim();
      if (!val || val === 'N/A' || val === '') continue;
      const rate = parseFloat(val);
      if (!isNaN(rate) && rate > 0) {
        ecbRates.get(currencyCodes[j])!.push({ date, rate });
      }
    }
    dateCount++;
  }

  // Validate data freshness: check that the newest date is within the last 2 years.
  // The ECB endpoint has been observed to return truncated/corrupted historical data
  // (e.g. only up to 2010 with fake rates), which causes wildly wrong conversions.
  const usdRates = ecbRates.get('USD');
  if (usdRates && usdRates.length > 0) {
    const newestDate = usdRates.reduce((best, r) => r.date > best ? r.date : best, usdRates[0].date);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const cutoff = twoYearsAgo.toISOString().slice(0, 10);

    if (newestDate < cutoff) {
      console.warn(`[Currency] ECB data is stale (newest: ${newestDate}), falling back to hardcoded rates`);
      ecbRates.clear();
      return { loaded: false, currencies: 0, dates: dateCount };
    }
  }

  ecbLoaded = true;
  console.log(`[Currency] Loaded ECB rates: ${currencyCodes.length} currencies, ${dateCount} dates`);
  return { loaded: true, currencies: currencyCodes.length, dates: dateCount };
}

// ----------------------------------------------------------------------------
// Hardcoded fallback rates (used when ECB fetch fails)
// ----------------------------------------------------------------------------

const HARDCODED_EUR_USD_RATES: ICurrencyRate[] = [
  { date: "2017-01-01", from: "EUR", to: "USD", rate: 1.0541 },
  { date: "2017-07-01", from: "EUR", to: "USD", rate: 1.1412 },
  { date: "2017-12-31", from: "EUR", to: "USD", rate: 1.1993 },
  { date: "2018-01-01", from: "EUR", to: "USD", rate: 1.2005 },
  { date: "2018-07-01", from: "EUR", to: "USD", rate: 1.1658 },
  { date: "2018-12-31", from: "EUR", to: "USD", rate: 1.1450 },
  { date: "2019-01-01", from: "EUR", to: "USD", rate: 1.1450 },
  { date: "2019-07-01", from: "EUR", to: "USD", rate: 1.1380 },
  { date: "2019-12-31", from: "EUR", to: "USD", rate: 1.1213 },
  { date: "2020-01-01", from: "EUR", to: "USD", rate: 1.1213 },
  { date: "2020-04-08", from: "EUR", to: "USD", rate: 1.0870 },
  { date: "2020-07-01", from: "EUR", to: "USD", rate: 1.1198 },
  { date: "2020-10-21", from: "EUR", to: "USD", rate: 1.1840 },
  { date: "2020-11-24", from: "EUR", to: "USD", rate: 1.1890 },
  { date: "2020-12-31", from: "EUR", to: "USD", rate: 1.2271 },
  { date: "2021-01-01", from: "EUR", to: "USD", rate: 1.2271 },
  { date: "2021-02-11", from: "EUR", to: "USD", rate: 1.2120 },
  { date: "2021-04-10", from: "EUR", to: "USD", rate: 1.1900 },
  { date: "2021-07-01", from: "EUR", to: "USD", rate: 1.1856 },
  { date: "2021-07-31", from: "EUR", to: "USD", rate: 1.1870 },
  { date: "2021-12-14", from: "EUR", to: "USD", rate: 1.1280 },
  { date: "2021-12-31", from: "EUR", to: "USD", rate: 1.1326 },
  { date: "2022-01-01", from: "EUR", to: "USD", rate: 1.1326 },
  { date: "2022-07-01", from: "EUR", to: "USD", rate: 1.0387 },
  { date: "2022-12-31", from: "EUR", to: "USD", rate: 1.0666 },
  { date: "2023-01-01", from: "EUR", to: "USD", rate: 1.0666 },
  { date: "2023-07-01", from: "EUR", to: "USD", rate: 1.0866 },
  { date: "2023-12-31", from: "EUR", to: "USD", rate: 1.1050 },
  { date: "2024-01-01", from: "EUR", to: "USD", rate: 1.1050 },
  { date: "2024-07-01", from: "EUR", to: "USD", rate: 1.0710 },
  { date: "2024-10-04", from: "EUR", to: "USD", rate: 1.0980 },
  { date: "2024-10-08", from: "EUR", to: "USD", rate: 1.0975 },
  { date: "2024-11-19", from: "EUR", to: "USD", rate: 1.0550 },
  { date: "2024-12-31", from: "EUR", to: "USD", rate: 1.0350 },
  { date: "2025-01-01", from: "EUR", to: "USD", rate: 1.0350 },
  { date: "2025-01-14", from: "EUR", to: "USD", rate: 1.0290 },
  { date: "2025-01-28", from: "EUR", to: "USD", rate: 1.0430 },
  { date: "2025-03-01", from: "EUR", to: "USD", rate: 1.0380 },
  { date: "2025-04-09", from: "EUR", to: "USD", rate: 1.0950 },
  { date: "2025-04-16", from: "EUR", to: "USD", rate: 1.1360 },
  { date: "2025-05-29", from: "EUR", to: "USD", rate: 1.1280 },
  { date: "2025-06-18", from: "EUR", to: "USD", rate: 1.1180 },
  { date: "2025-07-01", from: "EUR", to: "USD", rate: 1.1100 },
  { date: "2025-12-31", from: "EUR", to: "USD", rate: 1.1000 },
  { date: "2026-01-01", from: "EUR", to: "USD", rate: 1.1000 },
  { date: "2026-01-28", from: "EUR", to: "USD", rate: 1.0450 },
  { date: "2026-03-01", from: "EUR", to: "USD", rate: 1.0500 },
  { date: "2026-03-26", from: "EUR", to: "USD", rate: 1.0800 },
];

// ----------------------------------------------------------------------------
// Rate lookup
// ----------------------------------------------------------------------------

function findClosestRate(
  rates: Array<{ date: string; rate: number }>,
  targetDate: string,
): { date: string; rate: number } | undefined {
  if (rates.length === 0) return undefined;

  const target = new Date(targetDate).getTime();
  let best = rates[0];
  let bestDiff = Math.abs(new Date(best.date).getTime() - target);

  for (let i = 1; i < rates.length; i++) {
    const diff = Math.abs(new Date(rates[i].date).getTime() - target);
    if (diff < bestDiff) {
      best = rates[i];
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * Get the EUR→X rate from ECB data, or fall back to hardcoded rates.
 * ECB rates express: 1 EUR = N units of the target currency.
 */
function getEurToRate(date: string, currency: string): number {
  // Try ECB data first
  if (ecbLoaded) {
    // ECB uses "CNY" for Chinese yuan; CNH (offshore) is very close
    const lookupCurrency = currency === 'CNH' ? 'CNY' : currency;
    const rates = ecbRates.get(lookupCurrency);
    if (rates && rates.length > 0) {
      const closest = findClosestRate(rates, date);
      if (closest) return closest.rate;
    }
  }

  // Fallback: hardcoded EUR/USD
  if (currency === 'USD') {
    const closest = findClosestRate(
      HARDCODED_EUR_USD_RATES.map(r => ({ date: r.date, rate: r.rate })),
      date,
    );
    return closest?.rate ?? 1.08;
  }

  // Approximate CNH via USD if ECB not loaded
  if (currency === 'CNH' || currency === 'CNY') {
    const usdRate = getEurToRate(date, 'USD');
    return usdRate / 0.1445; // CNH/USD ≈ 0.1445, so EUR/CNH = EUR/USD / (CNH/USD)
  }

  // DKK near-fixed to EUR
  if (currency === 'DKK') return 7.4573;

  return 1; // unknown
}

/**
 * Get the exchange rate for a currency pair on a given date.
 * Returns how many units of `to` you get for 1 unit of `from`.
 */
export function getExchangeRate(
  date: string,
  from: string,
  to: string,
): number {
  if (from === to) return 1;

  // EUR → X
  if (from === 'EUR') {
    return getEurToRate(date, to);
  }

  // X → EUR
  if (to === 'EUR') {
    const eurToFrom = getEurToRate(date, from);
    return 1 / eurToFrom;
  }

  // X → Y: go via EUR (X → EUR → Y)
  const xToEur = 1 / getEurToRate(date, from);
  const eurToY = getEurToRate(date, to);
  return xToEur * eurToY;
}

/**
 * Convert an amount from one currency to another on a given date.
 */
export function convertAmount(
  amount: number,
  date: string,
  from: string,
  to: string,
): number {
  return amount * getExchangeRate(date, from, to);
}

/** Whether ECB rates have been loaded */
export function isEcbLoaded(): boolean {
  return ecbLoaded;
}
