import type {
  NormalizedTrade,
  NormalizedDividend,
  NormalizedFee,
  Position,
  ClosedTrade,
  OpenLot,
  DividendSummary,
  PortfolioData,
  WixData,
} from './types';
import { CURRENT_PRICES } from './prices';
import { getFxRate } from './fx';

// Symbol normalization for display (keep originals for aggregation since
// different share classes like BABA-US vs 89988-HK should stay separate)
const SYMBOL_DESCRIPTIONS: Record<string, string> = {
  'APG1L': 'Apranga Group',
  'IGN1L': 'Ignitis Grupe',
  'TEL1L': 'Telia Lietuva',
  'KNF1L': 'Kn Filter',
  'ASML': 'ASML Holding NV',
  'NOVOBc': 'Novo Nordisk',
  'BABA': 'Alibaba Group (ADR)',
  '89988': 'Alibaba Group (HK)',
  '002594': 'BYD Co Ltd',
  'NOMD': 'Nomad Foods',
  'WIX': 'Wix.com Ltd',
  'E3G1': 'Evolution AB',
  'DCX': 'Mercedes-Benz Group',
  'NHCBHFFT': 'Nasdaq Helsinki ETF',
  'BTC': 'Bitcoin',
  'XRP': 'Ripple',
};

function getDescription(symbol: string, tradeDesc?: string): string {
  return SYMBOL_DESCRIPTIONS[symbol] || tradeDesc || symbol;
}

export function aggregatePortfolio(
  allTrades: NormalizedTrade[],
  allDividends: NormalizedDividend[],
  allFees: NormalizedFee[],
  wixData: WixData | null
): PortfolioData {
  // Sort trades by date ascending
  const sortedTrades = [...allTrades].sort((a, b) => a.date.localeCompare(b.date));

  // FIFO lot tracking per symbol
  const lotsMap = new Map<string, OpenLot[]>();
  const closedTrades: ClosedTrade[] = [];
  const brokersBySymbol = new Map<string, Set<string>>();
  const descriptionBySymbol = new Map<string, string>();
  const currencyBySymbol = new Map<string, string>();
  const countryBySymbol = new Map<string, string>();

  for (const trade of sortedTrades) {
    const { symbol, side, quantity, broker } = trade;

    // Track metadata
    if (!brokersBySymbol.has(symbol)) brokersBySymbol.set(symbol, new Set());
    brokersBySymbol.get(symbol)!.add(broker);
    if (!descriptionBySymbol.has(symbol)) {
      descriptionBySymbol.set(symbol, getDescription(symbol, trade.description));
    }
    if (!currencyBySymbol.has(symbol)) currencyBySymbol.set(symbol, trade.currency);
    if (!countryBySymbol.has(symbol)) countryBySymbol.set(symbol, trade.country);

    if (!lotsMap.has(symbol)) lotsMap.set(symbol, []);
    const lots = lotsMap.get(symbol)!;

    if (side === 'BUY') {
      const perShareEUR = quantity > 0 ? trade.totalEUR / quantity : 0;
      lots.push({
        date: trade.date,
        quantity,
        priceEUR: perShareEUR,
        broker,
      });
    } else {
      // SELL — consume lots FIFO
      let remaining = quantity;
      const sellPerShareEUR = quantity > 0 ? trade.totalEUR / quantity : 0;

      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const consumed = Math.min(remaining, lot.quantity);
        const costBasis = consumed * lot.priceEUR;
        const proceeds = consumed * sellPerShareEUR;

        closedTrades.push({
          date: trade.date,
          symbol,
          description: getDescription(symbol, trade.description),
          quantity: consumed,
          costBasisEUR: costBasis,
          proceedsEUR: proceeds,
          realizedPnLEUR: proceeds - costBasis,
          broker,
        });

        lot.quantity -= consumed;
        remaining -= consumed;

        if (lot.quantity <= 0) {
          lots.shift();
        }
      }

      // If we sold more than we had (shouldn't happen normally), just record it
      if (remaining > 0) {
        closedTrades.push({
          date: trade.date,
          symbol,
          description: getDescription(symbol, trade.description),
          quantity: remaining,
          costBasisEUR: 0,
          proceedsEUR: remaining * sellPerShareEUR,
          realizedPnLEUR: remaining * sellPerShareEUR,
          broker,
        });
      }
    }
  }

  // Build open positions from remaining lots
  const positions: Position[] = [];

  for (const [symbol, lots] of lotsMap.entries()) {
    const totalQty = lots.reduce((sum, l) => sum + l.quantity, 0);
    if (totalQty <= 0.0001) continue; // Skip zero positions

    const totalCost = lots.reduce((sum, l) => sum + l.quantity * l.priceEUR, 0);
    const avgCost = totalQty > 0 ? totalCost / totalQty : 0;

    const priceInfo = CURRENT_PRICES[symbol];
    const currency = currencyBySymbol.get(symbol) || 'EUR';
    const currentPriceNative = priceInfo?.price || 0;
    const priceCurrency = priceInfo?.currency || currency;
    const currentPriceEUR = currentPriceNative * getFxRate(priceCurrency);
    const currentValue = totalQty * currentPriceEUR;
    const unrealizedPnL = currentValue - totalCost;
    const unrealizedPnLPct = totalCost > 0 ? (unrealizedPnL / totalCost) * 100 : 0;

    positions.push({
      symbol,
      description: descriptionBySymbol.get(symbol) || symbol,
      totalQuantity: totalQty,
      avgCostEUR: avgCost,
      totalCostEUR: totalCost,
      currentPriceNative,
      currentPriceEUR,
      currentValueEUR: currentValue,
      unrealizedPnLEUR: unrealizedPnL,
      unrealizedPnLPct,
      currency: priceCurrency,
      country: countryBySymbol.get(symbol) || '',
      brokers: Array.from(brokersBySymbol.get(symbol) || []),
      lots: [...lots],
    });
  }

  // Sort positions by value descending
  positions.sort((a, b) => b.currentValueEUR - a.currentValueEUR);

  // Dividend summary
  const dividendSummary = aggregateDividends(allDividends);

  // Fees
  const totalFees = allFees.reduce((sum, f) => sum + f.amount, 0);

  // Portfolio summary
  const totalValue = positions.reduce((sum, p) => sum + p.currentValueEUR, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.totalCostEUR, 0);
  const unrealizedPnL = totalValue - totalCost;
  const realizedPnL = closedTrades.reduce((sum, t) => sum + t.realizedPnLEUR, 0);

  return {
    positions,
    closedTrades,
    trades: sortedTrades,
    dividends: allDividends,
    dividendSummary,
    fees: allFees,
    totalFees,
    wixData,
    summary: {
      totalValue,
      totalCost,
      unrealizedPnL,
      unrealizedPnLPct: totalCost > 0 ? (unrealizedPnL / totalCost) * 100 : 0,
      realizedPnL,
      totalDividends: dividendSummary.totalNet,
      positionCount: positions.length,
    },
  };
}

function aggregateDividends(dividends: NormalizedDividend[]): DividendSummary {
  const bySymbol: Record<string, { gross: number; tax: number; net: number; count: number }> = {};
  let totalGross = 0;
  let totalTax = 0;
  let totalNet = 0;

  for (const d of dividends) {
    totalGross += d.grossAmount;
    totalTax += d.taxWithheld;
    totalNet += d.netAmount;

    if (!bySymbol[d.symbol]) {
      bySymbol[d.symbol] = { gross: 0, tax: 0, net: 0, count: 0 };
    }
    bySymbol[d.symbol].gross += d.grossAmount;
    bySymbol[d.symbol].tax += d.taxWithheld;
    bySymbol[d.symbol].net += d.netAmount;
    bySymbol[d.symbol].count++;
  }

  return {
    totalGross,
    totalTax,
    totalNet,
    paymentCount: dividends.length,
    bySymbol,
  };
}
