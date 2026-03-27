// ============================================================================
// Currency Conversion — Hardcoded Stub
// ============================================================================
//
// TODO: Replace hardcoded rates with CSV lookup covering all dates and pairs.
//       The backing data source is isolated behind getExchangeRate() so the
//       swap is trivial — just change the lookup implementation.
// ============================================================================

import type { ICurrencyRate } from "./types.js";

/**
 * Hardcoded EUR/USD rates for representative dates spanning 2017–2026.
 * Rates express: 1 EUR = N USD.
 *
 * TODO: Replace with a CSV-backed lookup (e.g. ECB reference rates).
 */
const HARDCODED_EUR_USD_RATES: ICurrencyRate[] = [
  // 2017
  { date: "2017-01-01", from: "EUR", to: "USD", rate: 1.0541 },
  { date: "2017-07-01", from: "EUR", to: "USD", rate: 1.1412 },
  { date: "2017-12-31", from: "EUR", to: "USD", rate: 1.1993 },
  // 2018
  { date: "2018-01-01", from: "EUR", to: "USD", rate: 1.2005 },
  { date: "2018-07-01", from: "EUR", to: "USD", rate: 1.1658 },
  { date: "2018-12-31", from: "EUR", to: "USD", rate: 1.1450 },
  // 2019
  { date: "2019-01-01", from: "EUR", to: "USD", rate: 1.1450 },
  { date: "2019-07-01", from: "EUR", to: "USD", rate: 1.1380 },
  { date: "2019-12-31", from: "EUR", to: "USD", rate: 1.1213 },
  // 2020
  { date: "2020-01-01", from: "EUR", to: "USD", rate: 1.1213 },
  { date: "2020-04-08", from: "EUR", to: "USD", rate: 1.0870 },
  { date: "2020-07-01", from: "EUR", to: "USD", rate: 1.1198 },
  { date: "2020-10-21", from: "EUR", to: "USD", rate: 1.1840 },
  { date: "2020-11-24", from: "EUR", to: "USD", rate: 1.1890 },
  { date: "2020-12-31", from: "EUR", to: "USD", rate: 1.2271 },
  // 2021
  { date: "2021-01-01", from: "EUR", to: "USD", rate: 1.2271 },
  { date: "2021-02-11", from: "EUR", to: "USD", rate: 1.2120 },
  { date: "2021-04-10", from: "EUR", to: "USD", rate: 1.1900 },
  { date: "2021-07-01", from: "EUR", to: "USD", rate: 1.1856 },
  { date: "2021-07-31", from: "EUR", to: "USD", rate: 1.1870 },
  { date: "2021-12-14", from: "EUR", to: "USD", rate: 1.1280 },
  { date: "2021-12-31", from: "EUR", to: "USD", rate: 1.1326 },
  // 2022
  { date: "2022-01-01", from: "EUR", to: "USD", rate: 1.1326 },
  { date: "2022-07-01", from: "EUR", to: "USD", rate: 1.0387 },
  { date: "2022-12-31", from: "EUR", to: "USD", rate: 1.0666 },
  // 2023
  { date: "2023-01-01", from: "EUR", to: "USD", rate: 1.0666 },
  { date: "2023-07-01", from: "EUR", to: "USD", rate: 1.0866 },
  { date: "2023-12-31", from: "EUR", to: "USD", rate: 1.1050 },
  // 2024
  { date: "2024-01-01", from: "EUR", to: "USD", rate: 1.1050 },
  { date: "2024-07-01", from: "EUR", to: "USD", rate: 1.0710 },
  { date: "2024-10-04", from: "EUR", to: "USD", rate: 1.0980 },
  { date: "2024-10-08", from: "EUR", to: "USD", rate: 1.0975 },
  { date: "2024-11-19", from: "EUR", to: "USD", rate: 1.0550 },
  { date: "2024-12-31", from: "EUR", to: "USD", rate: 1.0350 },
  // 2025
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
  // 2026
  { date: "2026-01-01", from: "EUR", to: "USD", rate: 1.1000 },
  { date: "2026-01-28", from: "EUR", to: "USD", rate: 1.0450 },
  { date: "2026-03-01", from: "EUR", to: "USD", rate: 1.0500 },
  { date: "2026-03-26", from: "EUR", to: "USD", rate: 1.0800 },
];

/**
 * Find the closest rate to a given date by picking the entry with
 * the smallest absolute date difference.
 */
function findClosestRate(
  rates: ICurrencyRate[],
  targetDate: string,
): ICurrencyRate | undefined {
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
 * Get the exchange rate for a currency pair on a given date.
 *
 * Returns how many units of `to` you get for 1 unit of `from`.
 *
 * @param date  ISO 8601 date string (YYYY-MM-DD)
 * @param from  Source currency code (e.g. "USD")
 * @param to    Target currency code (e.g. "EUR")
 * @returns     Exchange rate (1 `from` = rate `to`)
 *
 * TODO: Replace with CSV-backed lookup for full date coverage.
 */
export function getExchangeRate(
  date: string,
  from: string,
  to: string,
): number {
  // Identity
  if (from === to) return 1;

  // EUR → USD: use hardcoded table directly
  if (from === "EUR" && to === "USD") {
    const entry = findClosestRate(HARDCODED_EUR_USD_RATES, date);
    return entry?.rate ?? 1.08;
  }

  // USD → EUR: invert the EUR→USD rate
  if (from === "USD" && to === "EUR") {
    const entry = findClosestRate(HARDCODED_EUR_USD_RATES, date);
    return entry ? 1 / entry.rate : 1 / 1.08;
  }

  // CNH (offshore yuan) → EUR: approximate via USD
  // TODO: Add direct CNH rates when CSV data is available
  if (from === "CNH" && to === "EUR") {
    const cnh_to_usd = 0.1380; // approximate CNH/USD
    const usd_to_eur = getExchangeRate(date, "USD", "EUR");
    return cnh_to_usd * usd_to_eur;
  }
  if (from === "EUR" && to === "CNH") {
    return 1 / getExchangeRate(date, "CNH", "EUR");
  }

  // DKK → EUR: Denmark has a near-fixed rate to EUR
  if (from === "DKK" && to === "EUR") return 0.1341;
  if (from === "EUR" && to === "DKK") return 7.4573;

  // Fallback: unsupported pair
  console.warn(
    `No exchange rate available for ${from}→${to} on ${date}, returning 1`,
  );
  return 1;
}

/**
 * Convert an amount from one currency to another on a given date.
 *
 * @param amount  The monetary amount in the source currency
 * @param date    ISO 8601 date string (YYYY-MM-DD)
 * @param from    Source currency code
 * @param to      Target currency code
 * @returns       The amount in the target currency
 */
export function convertAmount(
  amount: number,
  date: string,
  from: string,
  to: string,
): number {
  return amount * getExchangeRate(date, from, to);
}
