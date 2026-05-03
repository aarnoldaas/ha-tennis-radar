import type { CashBalance, IncomeRow, Transaction } from '../parsers/types.js';
import type { FxService } from '../market/fx.js';

/**
 * Aggregate dividend / interest / tax transactions into per-(instrument,
 * broker, year) income rows in base EUR. Withholding tax is subtracted from
 * gross when we can match tax rows to their dividend on (instrument, date);
 * otherwise we report tax per symbol.
 */
export function buildIncome(transactions: Transaction[], fx: FxService): IncomeRow[] {
  const map = new Map<string, IncomeRow>();

  const add = (k: string, row: IncomeRow) => map.set(k, row);
  const key = (sym: string, broker: string, year: number, kind: string) => `${sym}|${broker}|${year}|${kind}`;

  for (const tx of transactions) {
    if (tx.kind !== 'dividend' && tx.kind !== 'interest' && tx.kind !== 'tax') continue;
    const year = Number(tx.timestamp.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    const sym = tx.rawSymbol ?? (tx.kind === 'interest' ? 'INTEREST' : '(unresolved)');
    const incomeKind: 'dividend' | 'interest' = tx.kind === 'interest' ? 'interest' : 'dividend';
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

/**
 * Reduce all cash-affecting transactions to a per-broker per-currency net
 * balance. Converts to base using the current spot rate for display in the
 * KPI strip.
 */
export function buildCash(transactions: Transaction[], fx: FxService): CashBalance[] {
  const map = new Map<string, CashBalance>();
  for (const tx of transactions) {
    if (tx.kind === 'internal') continue;
    const k = `${tx.broker}|${tx.currency}`;
    const entry = map.get(k) ?? {
      broker: tx.broker,
      currency: tx.currency,
      amount: 0,
      amountBase: 0,
    };
    entry.amount += tx.amount;
    map.set(k, entry);
  }
  for (const entry of map.values()) {
    entry.amountBase = fx.toBaseLatest(entry.amount, entry.currency);
  }
  return [...map.values()].sort((a, b) => {
    if (a.broker !== b.broker) return a.broker.localeCompare(b.broker);
    return a.currency.localeCompare(b.currency);
  });
}
