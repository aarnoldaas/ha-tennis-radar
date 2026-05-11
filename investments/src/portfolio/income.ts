import type { IncomeRow, Transaction } from '../parsers/types.js';
import type { FxService } from '../market/fx.js';

/**
 * Aggregate dividend / interest / tax transactions into per-(instrument,
 * broker, year) income rows in base EUR. Withholding tax is subtracted from
 * gross when we can match tax rows to their dividend on (instrument, date);
 * otherwise we report tax per symbol.
 *
 * Cash movements (deposits, withdrawals, fees, buys, sells) are not tracked
 * anywhere — this module is strictly about income.
 */
export function buildIncome(transactions: Transaction[], fx: FxService): IncomeRow[] {
  const map = new Map<string, IncomeRow>();

  const add = (k: string, row: IncomeRow) => map.set(k, row);
  const key = (sym: string, broker: string, year: number, kind: string) => `${sym}|${broker}|${year}|${kind}`;

  for (const tx of transactions) {
    if (tx.kind !== 'dividend' && tx.kind !== 'interest' && tx.kind !== 'tax') continue;
    const year = Number(tx.timestamp.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    // Symbolless withholding-tax rows whose description mentions
    // "Credit Interest" are IBKR's interest-withholding rows. Net them
    // against the matching `Credit Interest` row instead of bucketing
    // them as a no-symbol "(unresolved)" dividend. We detect this on the
    // description so the parser can leave rawSymbol null (no fake ticker
    // leaks into the Transactions / Mappings UI).
    const isInterestTax =
      tx.kind === 'tax' && !tx.rawSymbol && /credit interest/i.test(tx.notes ?? '');
    const isInterestRow = tx.kind === 'interest' || isInterestTax;
    const sym = tx.rawSymbol ?? (isInterestRow ? '__interest__' : '(unresolved)');
    const incomeKind: 'dividend' | 'interest' = isInterestRow ? 'interest' : 'dividend';
    const k = key(sym, tx.broker, year, incomeKind);

    const existing = map.get(k) ?? {
      instrumentId: tx.instrumentId,
      symbol: sym,
      broker: tx.broker,
      year,
      grossBase: 0,
      taxBase: 0,
      netBase: 0,
      currency: tx.currency,
      kind: incomeKind,
    };

    const amountBase = fx.toBase(tx.amount, tx.currency, tx.timestamp);
    if (tx.kind === 'tax') {
      existing.taxBase += -amountBase;
    } else {
      existing.grossBase += amountBase;
    }
    existing.netBase = existing.grossBase - existing.taxBase;
    if (!existing.instrumentId && tx.instrumentId) existing.instrumentId = tx.instrumentId;

    add(k, existing);
  }

  return [...map.values()].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return b.netBase - a.netBase;
  });
}
