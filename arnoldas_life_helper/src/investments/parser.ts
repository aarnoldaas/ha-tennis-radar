// ============================================================================
// Data Parser Interface
// ============================================================================
//
// One implementation per broker. Parsers are NOT implemented yet — this file
// defines the contract they must fulfill.
//
// TODO: Implement parsers:
//   - SwedBankParser      → ISwedBankTransaction[]
//   - IBParser            → IInteractiveBrokersTransaction[]
//   - RevolutParser       → IRevolutData (multi-section)
//   - WixIssuedParser     → IWixShareIssued[]
//   - WixSoldParser       → IWixShareSold[]
// ============================================================================

import type {
  IRevolutFlexibleCashTransaction,
  IRevolutSavingsTransaction,
  IRevolutBrokerageSell,
  IRevolutCryptoSell,
} from "./types.js";

/**
 * Generic parser interface. Each broker gets one (or more) implementations.
 *
 * @template T  The raw transaction type produced by this parser
 */
export interface IDataParser<T> {
  /** Parse a file and return an array of typed records */
  parse(filePath: string): Promise<T[]>;
}

/**
 * The Revolut file is multi-section, so its parser returns a composite object
 * rather than a flat array.
 */
export interface IRevolutData {
  flexibleCashEur: IRevolutFlexibleCashTransaction[];
  flexibleCashUsd: IRevolutFlexibleCashTransaction[];
  savingsEur: IRevolutSavingsTransaction[];
  savingsUsd: IRevolutSavingsTransaction[];
  brokerageEur: IRevolutBrokerageSell[];
  brokerageUsd: IRevolutBrokerageSell[];
  crypto: IRevolutCryptoSell[];
}

export interface IRevolutParser {
  parse(filePath: string): Promise<IRevolutData>;
}

export { SwedBankParser, parseAllSwedbankFiles, classifySwedbankTransaction, classifySwedbankTransactions } from './swedbank-parser.js';

// TODO: Implement the following parser classes
// export class IBParser implements IDataParser<IInteractiveBrokersTransaction> { ... }
// export class RevolutParserImpl implements IRevolutParser { ... }
// export class WixIssuedParser implements IDataParser<IWixShareIssued> { ... }
// export class WixSoldParser implements IDataParser<IWixShareSold> { ... }
