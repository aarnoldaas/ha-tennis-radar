import type { Broker } from './types';

/**
 * Broker metadata shared by backend (directory walking) and frontend
 * (labels, GPM311 tax export). The `gpm311` block carries the account
 * identity used by the Lithuanian GPM311 investicinė-sąskaita CSV import:
 * only the brokerage account number and ISO country code — the importer
 * validates just the five required columns (saskaita / rusis / data /
 * suma / valstybe).
 *
 * `dividendAmount` says which figure the broker's own statement reports for
 * a dividend row — `gross` (IB: withholding arrives as separate rows) or
 * `net` (Swedbank: the statement amount is already after withholding). The
 * GPM311 export mirrors the statement figure so declared amounts stay
 * reconcilable against broker paperwork.
 */
export const BROKERS: Record<
  Broker,
  {
    label: string;
    gpm311: { saskaita: string; valstybe: string; dividendAmount: 'gross' | 'net' };
  }
> = {
  swedbank: {
    label: 'Swedbank',
    gpm311: { saskaita: 'LT977300010172883835', valstybe: 'LT', dividendAmount: 'net' },
  },
  'interactive-brokers': {
    label: 'Interactive Brokers',
    gpm311: { saskaita: 'U17250741', valstybe: 'IE', dividendAmount: 'gross' },
  },
};

export const BROKER_KEYS = Object.keys(BROKERS) as Broker[];
