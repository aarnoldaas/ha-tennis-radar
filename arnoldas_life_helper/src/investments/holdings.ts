import type { ITransaction, IHolding, ILot, Broker } from './types.js';
import { getCurrentPrice } from './prices.js';

export function computeHoldings(transactions: ITransaction[]): IHolding[] {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const lotsBySymbol = new Map<string, ILot[]>();

  for (const txn of sorted) {
    if ((txn.type === 'BUY' || txn.type === 'RSU_VEST' || txn.type === 'ESPP_PURCHASE') && txn.quantity > 0) {
      const lots = lotsBySymbol.get(txn.symbol) || [];
      const source = txn.type === 'RSU_VEST' ? 'RSU' : txn.type === 'ESPP_PURCHASE' ? 'ESPP' : 'MARKET';
      lots.push({
        id: `lot-${txn.id}`,
        symbol: txn.symbol,
        broker: txn.broker,
        source,
        acquisitionDate: txn.date,
        originalQuantity: txn.quantity,
        remainingQuantity: txn.quantity,
        costBasisPerShare: txn.pricePerUnit,
        currency: txn.currency,
        fmvAtAcquisition: txn.pricePerUnit,
        sourceTransactionId: txn.id,
      });
      lotsBySymbol.set(txn.symbol, lots);
    } else if ((txn.type === 'SELL' || txn.type === 'CRYPTO_SELL') && txn.quantity < 0) {
      const lots = lotsBySymbol.get(txn.symbol);
      if (!lots || lots.length === 0) continue;

      let remaining = Math.abs(txn.quantity);
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.remainingQuantity, remaining);
        lot.remainingQuantity -= take;
        remaining -= take;
      }
      // Remove fully consumed lots
      lotsBySymbol.set(txn.symbol, lots.filter(l => l.remainingQuantity > 0));
    }
  }

  const holdings: IHolding[] = [];

  for (const [symbol, lots] of lotsBySymbol.entries()) {
    if (lots.length === 0) continue;

    const totalQuantity = lots.reduce((sum, l) => sum + l.remainingQuantity, 0);
    if (totalQuantity <= 0) continue;

    const totalCostBasis = lots.reduce(
      (sum, l) => sum + l.remainingQuantity * l.costBasisPerShare, 0
    );
    const averageCostBasis = totalCostBasis / totalQuantity;
    const currency = lots[0].currency;
    const brokers = [...new Set(lots.map(l => l.broker))] as Broker[];

    const priceInfo = getCurrentPrice(symbol);
    const currentPrice = priceInfo?.price ?? 0;
    const currentValue = totalQuantity * currentPrice;
    const unrealizedPnl = currentValue - totalCostBasis;
    const unrealizedPnlPercent = totalCostBasis > 0
      ? (unrealizedPnl / totalCostBasis) * 100
      : 0;

    // All Swedbank transactions are EUR, so EUR values = original values
    holdings.push({
      symbol,
      name: symbol,
      brokers,
      lots,
      totalQuantity,
      averageCostBasis: Math.round(averageCostBasis * 100) / 100,
      totalCostBasis: Math.round(totalCostBasis * 100) / 100,
      currency,
      currentPrice,
      currentValue: Math.round(currentValue * 100) / 100,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      unrealizedPnlPercent: Math.round(unrealizedPnlPercent * 100) / 100,
      totalCostBasisEur: Math.round(totalCostBasis * 100) / 100,
      currentValueEur: Math.round(currentValue * 100) / 100,
      unrealizedPnlEur: Math.round(unrealizedPnl * 100) / 100,
    });
  }

  return holdings.sort((a, b) => b.currentValueEur - a.currentValueEur);
}
