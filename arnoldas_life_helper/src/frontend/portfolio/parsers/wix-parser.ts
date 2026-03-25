import Papa from 'papaparse';
import type { NormalizedTrade, WixGrant, WixESPP, WixData } from '../types';
import { getFxRate } from '../fx';

export function parseWix(
  files: Record<string, string>
): { trades: NormalizedTrade[]; wixData: WixData } {
  const trades: NormalizedTrade[] = [];
  const grants = new Map<string, WixGrant>();
  const esppPurchases: WixESPP[] = [];
  const sells: NormalizedTrade[] = [];
  let totalVested = 0;
  let totalSold = 0;
  let totalSoldProceeds = 0;

  // There's only one file: wix-transactions.csv
  const csv = Object.values(files)[0];
  if (!csv) return { trades, wixData: { grants: [], esppPurchases, sells, totalVested: 0, totalSold: 0, totalSoldProceeds: 0 } };

  const usdRate = getFxRate('USD');
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  for (const row of result.data) {
    const type = row['Type']?.trim();
    const date = row['Date']?.trim() || '';
    const shares = parseFloat(row['Shares']) || 0;
    const priceUSD = parseFloat(row['PriceUSD']) || 0;
    const totalUSD = parseFloat(row['TotalUSD']) || 0;
    const sourceId = row['SourceID']?.trim() || '';
    const notes = row['Notes']?.trim() || '';

    if (type === 'RSU_VEST') {
      totalVested += shares;

      // Track grant vesting
      const grantMatch = notes.match(/Grant\s+(\d+)\s+\((\d{4}-\d{2}-\d{2})\)/);
      const grantId = sourceId; // e.g., RSU-3894
      const grantDate = grantMatch ? grantMatch[2] : '';
      const isUpcoming = notes.toLowerCase().includes('upcoming');

      if (!grants.has(grantId)) {
        grants.set(grantId, {
          grantId,
          grantDate,
          vestEvents: [],
          totalShares: 0,
          vestedShares: 0,
          upcomingShares: 0,
        });
      }
      const grant = grants.get(grantId)!;
      grant.vestEvents.push({
        date,
        shares,
        status: isUpcoming ? 'upcoming' : 'vested',
      });
      grant.totalShares += shares;
      if (isUpcoming) {
        grant.upcomingShares += shares;
      } else {
        grant.vestedShares += shares;
      }

      // RSU vests as BUY with $0 cost
      trades.push({
        date,
        symbol: 'WIX',
        description: 'Wix.com Ltd RSU',
        side: 'BUY',
        quantity: shares,
        price: 0,
        currency: 'USD',
        fxRateToEUR: usdRate,
        totalEUR: 0,
        commission: 0,
        taxes: 0,
        broker: 'WIX',
        assetClass: 'RSU',
        country: 'IL',
        notes,
        rawSourceId: sourceId,
      });
    } else if (type === 'SELL') {
      totalSold += shares;
      totalSoldProceeds += totalUSD;

      const trade: NormalizedTrade = {
        date,
        symbol: 'WIX',
        description: 'Wix.com Ltd',
        side: 'SELL',
        quantity: shares,
        price: priceUSD,
        currency: 'USD',
        fxRateToEUR: usdRate,
        totalEUR: totalUSD * usdRate,
        commission: 0,
        taxes: 0,
        broker: 'WIX',
        assetClass: 'STK',
        country: 'IL',
        notes,
        rawSourceId: sourceId,
      };
      trades.push(trade);
      sells.push(trade);
    } else if (type === 'ESPP_BUY') {
      const isQuickSale = notes.toLowerCase().includes('quick sale');

      esppPurchases.push({
        date,
        shares,
        priceUSD,
        totalUSD,
        esppId: sourceId,
        type: isQuickSale ? 'Quick Sale' : 'Keep',
      });

      // Only track "Keep" ESPP as position (Quick Sale is immediately sold)
      if (!isQuickSale) {
        trades.push({
          date,
          symbol: 'WIX',
          description: 'Wix.com Ltd ESPP',
          side: 'BUY',
          quantity: shares,
          price: priceUSD,
          currency: 'USD',
          fxRateToEUR: usdRate,
          totalEUR: totalUSD * usdRate,
          commission: 0,
          taxes: 0,
          broker: 'WIX',
          assetClass: 'ESPP',
          country: 'IL',
          notes,
          rawSourceId: sourceId,
        });
      }
    }
  }

  return {
    trades,
    wixData: {
      grants: Array.from(grants.values()),
      esppPurchases,
      sells,
      totalVested,
      totalSold,
      totalSoldProceeds,
    },
  };
}
