import Papa from 'papaparse';
import type { NormalizedTrade } from '../types';

function parseIBDate(dateStr: string): string {
  // IB format: MM/DD/YYYY → YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
}

export function parseInteractiveBrokers(
  files: Record<string, string>
): { trades: NormalizedTrade[] } {
  const trades: NormalizedTrade[] = [];

  for (const [, csv] of Object.entries(files)) {
    const result = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });

    for (const row of result.data) {
      // Only stock/ETF trades
      const assetClass = row['AssetClass']?.trim();
      if (assetClass !== 'STK' && assetClass !== 'ETF') continue;

      // Only execution-level rows
      const level = row['LevelOfDetail']?.trim();
      if (level && level !== 'EXECUTION') continue;

      const side = row['Buy/Sell']?.trim();
      if (side !== 'BUY' && side !== 'SELL') continue;

      const quantity = Math.abs(parseFloat(row['Quantity']) || 0);
      if (quantity === 0) continue;

      const price = parseFloat(row['TradePrice']) || 0;
      const fxRate = parseFloat(row['FXRateToBase']) || 1;
      const tradeMoney = Math.abs(parseFloat(row['TradeMoney']) || 0);
      const commission = Math.abs(parseFloat(row['IBCommission']) || 0);
      const taxes = Math.abs(parseFloat(row['Taxes']) || 0);
      const currency = row['CurrencyPrimary']?.trim() || 'EUR';

      trades.push({
        date: parseIBDate(row['TradeDate']?.trim() || ''),
        symbol: row['Symbol']?.trim() || '',
        description: row['Description']?.trim() || '',
        side,
        quantity,
        price,
        currency,
        fxRateToEUR: fxRate,
        totalEUR: tradeMoney * fxRate,
        commission: commission * fxRate,
        taxes: taxes * fxRate,
        broker: 'IB',
        assetClass: assetClass === 'ETF' ? 'ETF' : 'STK',
        country: row['IssuerCountryCode']?.trim() || '',
        isin: row['ISIN']?.trim() || undefined,
        rawSourceId: row['TradeID']?.trim() || undefined,
      });
    }
  }

  return { trades };
}
