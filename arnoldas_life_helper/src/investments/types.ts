// ============================================================================
// Investment Portfolio Tracker — Domain Types
// ============================================================================

// ----------------------------------------------------------------------------
// Raw Data Representations (one per broker, matching file structure)
// ----------------------------------------------------------------------------

/**
 * Raw Swedbank transaction row.
 *
 * Parsed from CSV with columns:
 * Account No, RowType, Date, Beneficiary, Details, Amount, Currency, D/K,
 * Record ID, Code, Reference No, Doc. No, Code in payer IS, Client code,
 * Originator, Beneficiary party
 *
 * Trade details are embedded in the Details string, e.g.
 * "APG1L +250@1.9/SE:4361 VSE" (buy 250 shares of APG1L at 1.9 EUR).
 */
export interface ISwedBankTransaction {
  /** IBAN account number, e.g. "LT977300010172883835" */
  accountNo: string;
  /** Row type: "10" = balance, "20" = transaction, "82" = turnover, "86" = closing */
  rowType: string;
  /** Transaction date in YYYY-MM-DD format */
  date: string;
  /** Counterparty name */
  beneficiary: string;
  /** Free-text description — contains trade info (ticker, qty, price) for market transactions */
  details: string;
  /** Transaction amount (always positive; direction indicated by debitCredit) */
  amount: number;
  /** Always "EUR" */
  currency: string;
  /** "D" = debit (money out), "K" = credit (money in) */
  debitCredit: "D" | "K";
  /** Unique transaction identifier */
  recordId: string;
  /** Transaction type: AS=balance, MK=transfer, M=market, TT=trade tax, K2=turnover, LS=closing */
  code: string;
  /** Reference number (may be empty) */
  referenceNo: string;
  /** Document number (may be empty) */
  docNo: string;
}

/**
 * Raw Interactive Brokers transaction row.
 *
 * ~80-column CSV export covering global equities and forex conversions.
 * Forex rows have AssetClass="CASH" and Symbol like "EUR.USD".
 */
export interface IInteractiveBrokersTransaction {
  clientAccountId: string;
  currencyPrimary: string;
  /** Forex rate to the account's base currency */
  fxRateToBase: number;
  /** "STK" for stocks, "CASH" for forex conversions */
  assetClass: "STK" | "CASH";
  subCategory: string;
  symbol: string;
  description: string;
  /** ISIN when available */
  isin: string;
  listingExchange: string;
  tradeId: string;
  /** Date in MM/DD/YYYY format */
  tradeDate: string;
  /** Date+time in MM/DD/YYYY;HHMMSS format */
  dateTime: string;
  /** Positive for buys, negative for sells */
  quantity: number;
  tradePrice: number;
  tradeMoney: number;
  /** Negative of tradeMoney for buys, positive for sells */
  proceeds: number;
  taxes: number;
  /** Commission (always negative) */
  ibCommission: number;
  ibCommissionCurrency: string;
  /** Net cash impact of the trade */
  netCash: number;
  closePrice: number;
  /** "O" = open, "C" = close */
  openCloseIndicator: string;
  costBasis: number;
  fifoPnlRealized: number;
  mtmPnl: number;
  buySell: "BUY" | "SELL";
}

/**
 * Revolut Flexible Cash Fund / Savings Account transaction.
 *
 * The Revolut export is a multi-section file. The first ~920 lines cover
 * Flexible Cash Funds with columns: Date, Description, Value, Price per share,
 * Quantity per share. Lines ~921-1089 cover Savings Accounts with columns:
 * Date, Description, Money out, Money in, Balance.
 */
export interface IRevolutFlexibleCashTransaction {
  /** Date in "Mon DD, YYYY, HH:MM:SS AM/PM" format */
  date: string;
  /** Description like "Interest PAID EUR Class R IE000AZVL3K0" or "SELL EUR Class R …" */
  description: string;
  /** Transaction value (negative for sells/withdrawals/fees, positive for interest) with currency symbol */
  value: number;
  /** Currency extracted from the value field */
  currency: string;
  /** Price per share (present for buy/sell, absent for interest/fees) */
  pricePerShare: number | null;
  /** Quantity (present for buy/sell, absent for interest/fees) */
  quantity: number | null;
}

export interface IRevolutSavingsTransaction {
  /** Date in "Mon DD, YYYY" format */
  date: string;
  /** Description like "Net Interest Paid to 'Instant Access Savings' for Mar 26, 2026" */
  description: string;
  /** Money out amount (may be null) */
  moneyOut: number | null;
  /** Money in amount (may be null) */
  moneyIn: number | null;
  /** Running balance with currency */
  balance: number;
  /** Currency extracted from monetary fields */
  currency: string;
}

/**
 * Revolut brokerage sell record.
 *
 * Found in the Brokerage Account sections (EUR and USD).
 */
export interface IRevolutBrokerageSell {
  /** Acquisition date in "Mon DD, YYYY" format */
  dateAcquired: string;
  /** Sale date in "Mon DD, YYYY" format */
  dateSold: string;
  securityName: string;
  symbol: string;
  isin: string;
  country: string;
  quantity: number;
  costBasis: number;
  /** Cost basis converted to base currency (EUR) */
  costBasisBaseCurrency: number;
  costBasisRate: number;
  grossProceeds: number;
  grossProceedsBaseCurrency: number;
  grossProceedsRate: number;
  grossPnl: number;
  grossPnlBaseCurrency: number;
  fees: number;
  feesBaseCurrency: number;
  /** Original currency of the transaction ("EUR" or "USD") */
  currency: string;
}

/**
 * Revolut crypto sell record.
 */
export interface IRevolutCryptoSell {
  /** Acquisition date in "Mon DD, YYYY" format */
  dateAcquired: string;
  /** Sale date in "Mon DD, YYYY" format */
  dateSold: string;
  tokenName: string;
  quantity: number;
  /** Cost basis in USD */
  costBasis: number;
  /** Gross proceeds in USD */
  grossProceeds: number;
  /** Gross P/L in USD */
  grossPnl: number;
}

/**
 * Wix equity issuance record (RSU vesting or ESPP purchase).
 *
 * Parsed from space-delimited shares-issued.txt (no header row).
 * Columns: grant date, grant ID, type, vesting/purchase date, shares,
 * FMV, $, cost basis, $
 */
export interface IWixShareIssued {
  /** Grant/enrollment date in DD/MM/YYYY format */
  grantDate: string;
  /** Grant or plan identifier, e.g. "9637" for RSU, "ESPP13749" for ESPP */
  grantId: string;
  /** "RSU" or "ESPP" */
  type: "RSU" | "ESPP";
  /** Vesting date (RSU) or purchase date (ESPP) in DD/MM/YYYY format */
  vestingDate: string;
  /** Number of shares vested/purchased */
  shares: number;
  /** Fair market value per share at vesting/purchase date, in USD */
  fmv: number;
  /** Cost basis per share in USD — $0.00 for RSU, discounted price for ESPP */
  costBasisPerShare: number;
}

/**
 * Wix share sale record.
 *
 * Parsed from space-delimited shares-sold.txt (no header row).
 * Columns: txn ID, sale type (2 words), grant ID, grant date, type,
 * sale date, shares, sale price, $, cost basis, $, fees, $
 */
export interface IWixShareSold {
  /** Unique transaction identifier */
  transactionId: string;
  /**
   * "Sell of Restricted Stock" — same-day RSU/ESPP sale (compensation event).
   * "Sell of Stock" — later market sale (portfolio transaction).
   */
  saleType: "Sell of Restricted Stock" | "Sell of Stock";
  /** Grant or plan identifier matching IWixShareIssued.grantId */
  grantId: string;
  /** Original grant date in DD/MM/YYYY format */
  grantDate: string;
  /** "RSU" or "ESPP" */
  equityType: "RSU" | "ESPP";
  /** Date of sale in DD/MM/YYYY format */
  saleDate: string;
  /** Number of shares sold */
  shares: number;
  /** Sale price per share in USD */
  salePricePerShare: number;
  /** Cost basis per share in USD — $0.00 for RSU, discounted price for ESPP */
  costBasisPerShare: number;
  /** Brokerage fees/commission in USD */
  fees: number;
}

// ----------------------------------------------------------------------------
// Unified Domain Model
// ----------------------------------------------------------------------------

/** Source broker for a transaction or lot */
export type Broker = "swedbank" | "interactive-brokers" | "revolut" | "wix";

/** Acquisition source for a tax lot */
export type LotSource = "MARKET" | "RSU" | "ESPP";

/** Normalized transaction type across all brokers */
export type TransactionType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "INTEREST"
  | "TRANSFER"
  | "FEE"
  | "TAX"
  | "FOREX"
  | "RSU_VEST"
  | "ESPP_PURCHASE"
  | "CRYPTO_SELL";

/**
 * Normalized transaction from any broker.
 *
 * All dates are ISO 8601 (YYYY-MM-DD), all amounts are in the original
 * transaction currency with the currency code recorded alongside.
 */
export interface ITransaction {
  /** Unique ID (broker-specific record/trade ID) */
  id: string;
  /** Source broker */
  broker: Broker;
  /** Normalized transaction type */
  type: TransactionType;
  /** ISO 8601 date (YYYY-MM-DD) */
  date: string;
  /** Ticker symbol (empty for transfers, interest, fees) */
  symbol: string;
  /** Human-readable security name */
  description: string;
  /** Number of shares/units (positive for buys, negative for sells; 0 for non-trade events) */
  quantity: number;
  /** Price per share/unit in the original currency (0 for non-trade events) */
  pricePerUnit: number;
  /** Total monetary amount in original currency (always positive) */
  amount: number;
  /** Original currency code (EUR, USD, etc.) */
  currency: string;
  /** Fees/commission in original currency */
  fees: number;
  /** Amount converted to base currency (EUR) */
  amountInBaseCurrency: number;
  /** Raw source data for debugging/auditing */
  raw?: unknown;
}

/**
 * A tax lot — an individual acquisition of shares.
 *
 * Used for FIFO cost basis tracking. A single purchase may create one lot;
 * a partial sale splits a lot into "consumed" and "remaining" portions.
 */
export interface ILot {
  /** Unique lot identifier */
  id: string;
  /** Ticker symbol */
  symbol: string;
  /** Source broker */
  broker: Broker;
  /** How the shares were acquired */
  source: LotSource;
  /** ISO 8601 acquisition date */
  acquisitionDate: string;
  /** Original number of shares in this lot */
  originalQuantity: number;
  /** Remaining shares (decreases as lots are consumed by sells via FIFO) */
  remainingQuantity: number;
  /** Cost basis per share in original currency */
  costBasisPerShare: number;
  /** Original currency */
  currency: string;
  /**
   * Fair market value per share at acquisition (relevant for RSU and ESPP).
   * For market purchases this equals costBasisPerShare.
   */
  fmvAtAcquisition: number;
  /** Transaction that created this lot */
  sourceTransactionId: string;
}

/**
 * ESPP-specific lot with discount tracking.
 */
export interface IEsppLot extends ILot {
  source: "ESPP";
  /** ESPP plan/enrollment ID */
  planId: string;
  /** Built-in discount per share = fmvAtAcquisition - costBasisPerShare */
  discountPerShare: number;
  /** Total built-in gain = discountPerShare × originalQuantity */
  totalBuiltInGain: number;
  /**
   * Market appreciation per share if sold, otherwise null.
   * = sale price - fmvAtAcquisition
   */
  marketAppreciationPerShare: number | null;
}

/**
 * Current holding — an open position.
 */
export interface IHolding {
  /** Ticker symbol */
  symbol: string;
  /** Human-readable name */
  name: string;
  /** Broker(s) holding this symbol */
  brokers: Broker[];
  /** All open lots for this symbol, ordered by acquisition date (oldest first) */
  lots: ILot[];
  /** Total shares held (sum of remainingQuantity across lots) */
  totalQuantity: number;
  /** Weighted average cost basis per share in original currency */
  averageCostBasis: number;
  /** Total cost basis in original currency */
  totalCostBasis: number;
  /** Original currency */
  currency: string;
  /** Current market price per share */
  currentPrice: number;
  /** Current total market value = totalQuantity × currentPrice */
  currentValue: number;
  /** Unrealized P/L = currentValue - totalCostBasis */
  unrealizedPnl: number;
  /** Unrealized P/L as percentage */
  unrealizedPnlPercent: number;
  /** All values above converted to EUR */
  totalCostBasisEur: number;
  currentValueEur: number;
  unrealizedPnlEur: number;
}

/**
 * A realized (closed) trade — shares sold with FIFO lot matching.
 */
export interface IRealizedTrade {
  /** Sell transaction ID */
  sellTransactionId: string;
  /** Ticker symbol */
  symbol: string;
  broker: Broker;
  /** ISO 8601 sell date */
  sellDate: string;
  /** Number of shares sold */
  quantity: number;
  /** Sale price per share */
  salePricePerShare: number;
  /** Total sale proceeds */
  proceeds: number;
  /** Currency of the sale */
  currency: string;
  /** Lots consumed by this sale (FIFO order) with the quantity taken from each */
  lotsConsumed: Array<{
    lot: ILot;
    /** How many shares from this lot were used */
    quantityUsed: number;
    /** Cost basis for the shares used from this lot */
    costBasis: number;
  }>;
  /** Total cost basis of all consumed lots */
  totalCostBasis: number;
  /** Realized P/L = proceeds - totalCostBasis - fees */
  realizedPnl: number;
  /** Fees/commission */
  fees: number;
  /** Hold period: "short-term" (<1 year) or "long-term" (≥1 year), based on oldest consumed lot */
  holdPeriod: "short-term" | "long-term";
  /** All values converted to EUR */
  proceedsEur: number;
  totalCostBasisEur: number;
  realizedPnlEur: number;
}

/**
 * Dividend payment record.
 */
export interface IDividendPayment {
  /** Source transaction ID */
  transactionId: string;
  /** ISO 8601 payment date */
  date: string;
  /** Ticker symbol */
  symbol: string;
  /** Broker that reported the dividend */
  broker: Broker;
  /** Gross amount received (net of tax withheld at source) */
  amount: number;
  /** Currency */
  currency: string;
  /** Amount in EUR */
  amountEur: number;
  /** Per-share dividend rate if available */
  perShareRate: number | null;
  /** Description from the broker */
  description: string;
}

/**
 * Interest payment record (Revolut Flexible Cash Funds / Savings Accounts).
 */
export interface IInterestPayment {
  /** ISO 8601 payment date */
  date: string;
  /** Interest source */
  source: "flexible-cash" | "savings";
  /** Amount earned */
  amount: number;
  /** Currency (EUR or USD) */
  currency: string;
  /** Amount in EUR */
  amountEur: number;
}

// ----------------------------------------------------------------------------
// ESPP-Specific
// ----------------------------------------------------------------------------

/**
 * Aggregated ESPP statistics for the dedicated ESPP view.
 */
export interface IEsppStatistics {
  /** Total discount captured across all ESPP lots (in USD) */
  totalDiscountCaptured: number;
  /** Total discount captured in EUR */
  totalDiscountCapturedEur: number;
  /** Per-lot breakdown */
  lots: IEsppLot[];
  /** Lots that have been sold (fully or partially) */
  soldLots: Array<{
    lot: IEsppLot;
    sellDate: string;
    sellPrice: number;
    /** Discount component: fmvAtAcquisition - costBasisPerShare */
    discountGain: number;
    /** Market component: sellPrice - fmvAtAcquisition */
    marketAppreciation: number;
    /** Total gain: discountGain + marketAppreciation */
    totalGain: number;
    /** Days held from purchase to sale */
    holdDays: number;
  }>;
  /** Lots still held */
  heldLots: IEsppLot[];
  /** Average discount percentage across all ESPP lots */
  averageDiscountPercent: number;
}

// ----------------------------------------------------------------------------
// RSU-Specific
// ----------------------------------------------------------------------------

/**
 * Individual RSU vesting event.
 */
export interface IRsuVesting {
  /** Grant identifier */
  grantId: string;
  /** ISO 8601 vesting date */
  vestingDate: string;
  /** Number of shares vested */
  shares: number;
  /** Fair market value per share at vesting (USD) */
  fmvAtVesting: number;
  /** Total compensation value = shares × fmvAtVesting */
  compensationValue: number;
  /** Compensation value in EUR */
  compensationValueEur: number;
  /** Whether shares were immediately sold (same-day sale) */
  isSameDaySale: boolean;
}

/**
 * Aggregated RSU compensation summary.
 */
export interface IRsuCompensationSummary {
  /** Total compensation value across all vestings (USD) */
  totalCompensation: number;
  /** Total compensation in EUR */
  totalCompensationEur: number;
  /** Breakdown by grant */
  byGrant: Array<{
    grantId: string;
    totalShares: number;
    totalCompensation: number;
    vestings: IRsuVesting[];
  }>;
  /** Breakdown by year */
  byYear: Array<{
    year: number;
    totalShares: number;
    totalCompensation: number;
    totalCompensationEur: number;
  }>;
  /** Cumulative compensation over time */
  cumulative: Array<{
    date: string;
    cumulativeCompensation: number;
    cumulativeCompensationEur: number;
  }>;
}

// ----------------------------------------------------------------------------
// Portfolio Aggregate
// ----------------------------------------------------------------------------

/**
 * Complete portfolio state — the top-level aggregate.
 */
export interface IPortfolio {
  /** All current holdings */
  holdings: IHolding[];
  /** All realized trades (excludes RSU same-day sales) */
  realizedTrades: IRealizedTrade[];
  /** All dividend payments */
  dividends: IDividendPayment[];
  /** All interest payments (Revolut) */
  interest: IInterestPayment[];
  /** ESPP statistics */
  esppStatistics: IEsppStatistics;
  /** RSU compensation summary (separate from portfolio P/L) */
  rsuCompensation: IRsuCompensationSummary;

  // --- Totals (all in EUR) ---

  /** Sum of all holdings' currentValueEur */
  totalHoldingsValueEur: number;
  /** Sum of all holdings' totalCostBasisEur */
  totalCostBasisEur: number;
  /** Total unrealized P/L across all holdings */
  totalUnrealizedPnlEur: number;
  /** Total realized P/L across all closed trades */
  totalRealizedPnlEur: number;
  /** Total dividends received */
  totalDividendsEur: number;
  /** Total interest earned */
  totalInterestEur: number;
  /** Total return = realized + unrealized + dividends + interest */
  totalReturnEur: number;
}

// ----------------------------------------------------------------------------
// Currency
// ----------------------------------------------------------------------------

/**
 * A single exchange rate record.
 */
export interface ICurrencyRate {
  /** ISO 8601 date */
  date: string;
  /** Source currency code */
  from: string;
  /** Target currency code */
  to: string;
  /** Exchange rate: 1 unit of `from` = `rate` units of `to` */
  rate: number;
}
