// ============================================================================
// Portfolio Analytics — Allocation & Concentration Risk
// ============================================================================

import type { IHolding } from './types.js';

// ----------------------------------------------------------------------------
// Ticker metadata
// ----------------------------------------------------------------------------

export interface TickerMeta {
  geography: string;
  assetClass: string;
  sector: string;
  currencyExposure: string;
}

const TICKER_META: Record<string, TickerMeta> = {
  // Baltic stocks
  APG1L: { geography: 'Baltic', assetClass: 'Stocks', sector: 'Utilities', currencyExposure: 'EUR' },
  IGN1L: { geography: 'Baltic', assetClass: 'Stocks', sector: 'Energy', currencyExposure: 'EUR' },
  TEL1L: { geography: 'Baltic', assetClass: 'Stocks', sector: 'Telecom', currencyExposure: 'EUR' },
  KNF1L: { geography: 'Baltic', assetClass: 'Stocks', sector: 'Industrials', currencyExposure: 'EUR' },
  SAB1L: { geography: 'Baltic', assetClass: 'Stocks', sector: 'Technology', currencyExposure: 'EUR' },
  LNA1L: { geography: 'Baltic', assetClass: 'Stocks', sector: 'Logistics', currencyExposure: 'EUR' },
  ROE1L: { geography: 'Baltic', assetClass: 'Stocks', sector: 'Industrials', currencyExposure: 'EUR' },
  // EU
  ASML: { geography: 'Europe', assetClass: 'Stocks', sector: 'Semiconductors', currencyExposure: 'EUR' },
  E3G1: { geography: 'Europe', assetClass: 'Stocks', sector: 'Gaming', currencyExposure: 'EUR' },
  // US
  GOOG: { geography: 'US', assetClass: 'Stocks', sector: 'Technology', currencyExposure: 'USD' },
  BABA: { geography: 'China', assetClass: 'Stocks', sector: 'E-Commerce', currencyExposure: 'USD' },
  WIX: { geography: 'US', assetClass: 'Stocks', sector: 'Technology', currencyExposure: 'USD' },
  PBR: { geography: 'Brazil', assetClass: 'Stocks', sector: 'Energy', currencyExposure: 'USD' },
  NOVA: { geography: 'Europe', assetClass: 'Stocks', sector: 'Healthcare', currencyExposure: 'USD' },
  // China
  '002594': { geography: 'China', assetClass: 'Stocks', sector: 'Automotive', currencyExposure: 'CNH' },
};

export function getTickerMeta(symbol: string): TickerMeta {
  return TICKER_META[symbol] || {
    geography: 'Other',
    assetClass: 'Stocks',
    sector: 'Other',
    currencyExposure: 'EUR',
  };
}

// ----------------------------------------------------------------------------
// Allocation breakdown
// ----------------------------------------------------------------------------

export interface AllocationEntry {
  name: string;
  valueEur: number;
  percent: number;
}

export interface AllocationBreakdown {
  byGeography: AllocationEntry[];
  byAssetClass: AllocationEntry[];
  byCurrency: AllocationEntry[];
  bySector: AllocationEntry[];
}

export function computeAllocation(holdings: IHolding[]): AllocationBreakdown {
  const totalValue = holdings.reduce((s, h) => s + h.currentValueEur, 0);
  if (totalValue === 0) {
    return { byGeography: [], byAssetClass: [], byCurrency: [], bySector: [] };
  }

  const geoMap = new Map<string, number>();
  const classMap = new Map<string, number>();
  const currMap = new Map<string, number>();
  const sectorMap = new Map<string, number>();

  for (const h of holdings) {
    const meta = getTickerMeta(h.symbol);
    geoMap.set(meta.geography, (geoMap.get(meta.geography) || 0) + h.currentValueEur);
    classMap.set(meta.assetClass, (classMap.get(meta.assetClass) || 0) + h.currentValueEur);
    currMap.set(meta.currencyExposure, (currMap.get(meta.currencyExposure) || 0) + h.currentValueEur);
    sectorMap.set(meta.sector, (sectorMap.get(meta.sector) || 0) + h.currentValueEur);
  }

  const toEntries = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([name, valueEur]) => ({
        name,
        valueEur: Math.round(valueEur * 100) / 100,
        percent: Math.round((valueEur / totalValue) * 10000) / 100,
      }))
      .sort((a, b) => b.percent - a.percent);

  return {
    byGeography: toEntries(geoMap),
    byAssetClass: toEntries(classMap),
    byCurrency: toEntries(currMap),
    bySector: toEntries(sectorMap),
  };
}

/**
 * Build a map of ticker symbol → metadata for all holdings.
 */
export function buildTickerMetaMap(holdings: IHolding[]): Record<string, TickerMeta> {
  const result: Record<string, TickerMeta> = {};
  for (const h of holdings) {
    result[h.symbol] = getTickerMeta(h.symbol);
  }
  return result;
}

// ----------------------------------------------------------------------------
// Concentration risk
// ----------------------------------------------------------------------------

export interface RiskWarning {
  type: 'concentration' | 'currency' | 'sector';
  severity: 'warning' | 'info';
  message: string;
}

export function computeRiskWarnings(holdings: IHolding[]): RiskWarning[] {
  const warnings: RiskWarning[] = [];
  const totalValue = holdings.reduce((s, h) => s + h.currentValueEur, 0);
  if (totalValue === 0) return warnings;

  // Single position > 20%
  for (const h of holdings) {
    const pct = (h.currentValueEur / totalValue) * 100;
    if (pct > 20) {
      warnings.push({
        type: 'concentration',
        severity: 'warning',
        message: `${h.symbol} is ${pct.toFixed(1)}% of portfolio — consider diversifying`,
      });
    }
  }

  // Single currency > 50%
  const currMap = new Map<string, number>();
  for (const h of holdings) {
    const meta = getTickerMeta(h.symbol);
    currMap.set(meta.currencyExposure, (currMap.get(meta.currencyExposure) || 0) + h.currentValueEur);
  }
  for (const [currency, value] of currMap) {
    const pct = (value / totalValue) * 100;
    if (pct > 50) {
      warnings.push({
        type: 'currency',
        severity: 'info',
        message: `${pct.toFixed(1)}% exposure to ${currency}`,
      });
    }
  }

  return warnings;
}
