import type { Broker } from '../../shared/types';

/**
 * Internal parser output — NOT part of the public API. Raw rows keep native
 * amounts and unresolved broker symbols; `normalize()` in the pipeline turns
 * them into the public `Transaction` shape (instrument resolution, EUR
 * conversion, tax folding).
 *
 * `tax` still exists here as a raw type: IB emits withholding as separate
 * rows. Normalization folds them into their dividend/interest counterpart.
 */
export type RawTxType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'interest'
  | 'tax'
  | 'deposit'
  | 'withdrawal';

export interface RawTx {
  /** Stable dedupe id (broker reference number or content hash). */
  id: string;
  broker: Broker;
  sourceFile: string;
  /** YYYY-MM-DD */
  date: string;
  type: RawTxType;
  rawSymbol: string | null;
  isin: string | null;
  /** Signed: positive = shares in. Trades only. */
  quantity: number | null;
  /** Per-unit price in `currency`. Trades only. */
  price: number | null;
  /** Signed cash effect in `currency` (or EUR when `amountIsEur`). */
  amount: number;
  currency: string;
  /**
   * True when the broker pre-converted `amount` to EUR (IB non-trade rows).
   * Trades always re-derive cash from `quantity * price` in native currency.
   */
  amountIsEur: boolean;
  /** Dividend gross before withholding, in `currency`. Swedbank only. */
  gross: number | null;
  /** Withholding tax (positive), in `currency`. Swedbank only. */
  tax: number | null;
  note: string | null;
}
