import type { ITransaction, IHolding, ILot, IRealizedTrade, Broker } from './types.js';
import { getCurrentPrice } from './prices.js';
import { convertAmount } from './currency.js';
import { adjustLotForSplits } from './corporate-actions.js';

interface HoldingsResult {
  holdings: IHolding[];
  realizedTrades: IRealizedTrade[];
}

export async function computeHoldings(transactions: ITransaction[]): Promise<HoldingsResult> {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const lotsBySymbol = new Map<string, ILot[]>();
  const realizedTrades: IRealizedTrade[] = [];

  for (const txn of sorted) {
    if ((txn.type === 'BUY' || txn.type === 'RSU_VEST' || txn.type === 'ESPP_PURCHASE') && txn.quantity > 0) {
      const lots = lotsBySymbol.get(txn.symbol) || [];
      const source = txn.type === 'RSU_VEST' ? 'RSU' : txn.type === 'ESPP_PURCHASE' ? 'ESPP' : 'MARKET';
      const lot: ILot = {
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
      };
      adjustLotForSplits(lot);
      lots.push(lot);
      lotsBySymbol.set(txn.symbol, lots);
    } else if ((txn.type === 'SELL' || txn.type === 'CRYPTO_SELL') && txn.quantity < 0) {
      const lots = lotsBySymbol.get(txn.symbol);
      if (!lots || lots.length === 0) continue;

      const sellQty = Math.abs(txn.quantity);
      const lotsConsumed: IRealizedTrade['lotsConsumed'] = [];
      let remaining = sellQty;

      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.remainingQuantity, remaining);
        lotsConsumed.push({
          lot: { ...lot },
          quantityUsed: take,
          costBasis: take * lot.costBasisPerShare,
        });
        lot.remainingQuantity -= take;
        remaining -= take;
      }
      // Remove fully consumed lots
      lotsBySymbol.set(txn.symbol, lots.filter(l => l.remainingQuantity > 0));

      // Build realized trade
      const totalCostBasis = lotsConsumed.reduce((s, lc) => s + lc.costBasis, 0);
      const proceeds = sellQty * txn.pricePerUnit;
      const fees = txn.fees;
      const realizedPnl = proceeds - totalCostBasis - fees;

      // Hold period based on oldest consumed lot
      const oldestLotDate = lotsConsumed.length > 0 ? lotsConsumed[0].lot.acquisitionDate : txn.date;
      const holdMs = new Date(txn.date).getTime() - new Date(oldestLotDate).getTime();
      const holdPeriod: 'short-term' | 'long-term' = holdMs >= 365 * 24 * 60 * 60 * 1000 ? 'long-term' : 'short-term';

      const lotCurrency = lotsConsumed[0]?.lot.currency ?? txn.currency;
      const proceedsEur = convertAmount(proceeds, txn.date, txn.currency, 'EUR');
      const totalCostBasisEur = convertAmount(totalCostBasis, txn.date, lotCurrency, 'EUR');
      const realizedPnlEur = proceedsEur - totalCostBasisEur;

      realizedTrades.push({
        sellTransactionId: txn.id,
        symbol: txn.symbol,
        broker: txn.broker,
        sellDate: txn.date,
        quantity: sellQty,
        salePricePerShare: txn.pricePerUnit,
        proceeds,
        currency: txn.currency,
        lotsConsumed,
        totalCostBasis,
        realizedPnl,
        fees,
        holdPeriod,
        proceedsEur,
        totalCostBasisEur,
        realizedPnlEur: Math.round(realizedPnlEur * 100) / 100,
      });
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
    const priceCurrency = priceInfo?.currency ?? currency;
    const priceLastUpdated = priceInfo?.lastUpdated ?? null;
    const currentValue = totalQuantity * currentPrice;

    // Convert both sides to EUR before computing P&L to avoid currency mismatch
    const today = new Date().toISOString().slice(0, 10);
    const totalCostBasisEur = convertAmount(totalCostBasis, today, currency, 'EUR');
    const currentValueEur = convertAmount(currentValue, today, priceCurrency, 'EUR');
    const unrealizedPnlEur = currentValueEur - totalCostBasisEur;

    // Original-currency P&L (only meaningful when currencies match)
    const unrealizedPnl = currency === priceCurrency
      ? currentValue - totalCostBasis
      : unrealizedPnlEur; // fall back to EUR when currencies differ

    const unrealizedPnlPercent = totalCostBasisEur > 0
      ? (unrealizedPnlEur / totalCostBasisEur) * 100
      : 0;

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
      totalCostBasisEur: Math.round(totalCostBasisEur * 100) / 100,
      currentValueEur: Math.round(currentValueEur * 100) / 100,
      unrealizedPnlEur: Math.round(unrealizedPnlEur * 100) / 100,
      priceLastUpdated,
    });
  }

  return {
    holdings: holdings.sort((a, b) => b.currentValueEur - a.currentValueEur),
    realizedTrades,
  };
}
