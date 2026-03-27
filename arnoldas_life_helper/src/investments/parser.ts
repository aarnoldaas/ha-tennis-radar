// ============================================================================
// Data Parser Interface
// ============================================================================
//
// One implementation per broker.
//
// Parsers:
//   - SwedBankParser      → ISwedBankTransaction[]
//   - IBParser            → IInteractiveBrokersTransaction[]
//   - RevolutParser       → IRevolutData (multi-section)
//   - WixParser           → IWixShareIssued[] + IWixShareSold[]
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
export { parseRevolutFile, parseAllRevolutFiles, classifyRevolutTransactions } from './revolut-parser.js';
export type { RevolutParsedData, RevolutInterestSummary } from './revolut-parser.js';
export { parseIBFile, parseAllIBFiles, classifyIBTransactions } from './ib-parser.js';
export { parseWixIssuedFile, parseWixSoldFile, parseAllWixFiles, classifyWixTransactions } from './wix-parser.js';
export type { WixParsedData } from './wix-parser.js';
