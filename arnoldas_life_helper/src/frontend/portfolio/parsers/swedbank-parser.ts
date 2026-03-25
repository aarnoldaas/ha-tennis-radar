import Papa from 'papaparse';
import type { NormalizedTrade, NormalizedDividend, NormalizedFee } from '../types';

// ISIN → symbol mapping for dividend parsing
const ISIN_TO_SYMBOL: Record<string, { symbol: string; name: string }> = {
  'LT0000115768': { symbol: 'IGN1L', name: 'Ignitis Grupe AB' },
  'LT0000102337': { symbol: 'APG1L', name: 'Apranga PVA' },
  'LT0000123911': { symbol: 'TEL1L', name: 'Telia Lietuva AB' },
  'EE3500110244': { symbol: 'NHCBHFFT', name: 'Nasdaq Helsinki ETF' },
  'DE0007100000': { symbol: 'DCX', name: 'Mercedes-Benz Group AG' },
};

// Trade regex: SYMBOL +/-QTY@PRICE/SE:REF EXCHANGE
const TRADE_REGEX = /^(\S+)\s+([+-]\d+)@([\d.]+)\/SE:[\w!]+ (.+)$/;
// Commission line: "K: SYMBOL ..." same pattern
const COMMISSION_PREFIX = 'K: ';

// Dividend patterns
const DIVIDEND_REGEX_2024 = /DIVIDENDAI\s*\/\s*(.+?)\s*\/\s*([A-Z]{2}\d{10})\s*\/\s*([\d.]+)\s*EUR\/VNT\.\s*\/\s*(\d+)%\s*MOK/;
const DIVIDEND_REGEX_2022 = /DIVIDENDAI\s+UŽ\s+(?:VP\s+)?(?:ISIN\s+)?(.+?)\s+(?:ISIN\s+)?([A-Z]{2}\d{10}),?\s*([\d.]+)\s*EUR\/VNT\.,?\s*(\d+)%\s*MOK/;

// Storage fee pattern
const FEE_REGEX = /VP sąskaita.*mėnesinis VP saugojimo mokestis/;

// Fund exclusion: counterparty contains "SWEDBANK, AB" (fund redemption/purchase)
function isFundOperation(details: string): boolean {
  if (details.startsWith("'")) return true; // Fundorder
  // Check if counterparty after SE:REF is "SWEDBANK, AB"
  const match = details.match(TRADE_REGEX);
  if (match) {
    const counterparty = match[4].trim();
    if (counterparty === 'SWEDBANK, AB' || counterparty === 'SWEDBANK,AB') return true;
  }
  return false;
}

// Known fund codes to exclude
const FUND_CODES = new Set(['SWRTECC', 'SWRMEDC', 'SWEDEM1', 'SWBACASC']);

export function parseSwedbank(
  files: Record<string, string>
): { trades: NormalizedTrade[]; dividends: NormalizedDividend[]; fees: NormalizedFee[] } {
  const trades: NormalizedTrade[] = [];
  const dividends: NormalizedDividend[] = [];
  const fees: NormalizedFee[] = [];

  for (const [, csv] of Object.entries(files)) {
    const result = Papa.parse<string[]>(csv, {
      header: false, // Use indices since headers vary (EN vs LT)
      skipEmptyLines: true,
    });

    // Skip header row (index 0)
    for (let i = 1; i < result.data.length; i++) {
      const row = result.data[i];
      if (!row || row.length < 8) continue;

      const rowType = row[1]?.trim();
      // Only process transaction rows (type "20")
      if (rowType !== '20') continue;

      const date = row[2]?.trim() || '';     // YYYY-MM-DD
      const details = row[4]?.trim() || '';
      const amount = parseFloat(row[5]?.replace(/,/g, '') || '0');
      const dk = row[7]?.trim();             // D=debit(out), K=credit(in)

      // Check for commission rows
      if (details.startsWith(COMMISSION_PREFIX)) {
        // Commission is a debit (D) — we track it but don't create a separate trade
        // It will be matched to the trade by date
        continue;
      }

      // Check for storage fees
      if (FEE_REGEX.test(details)) {
        fees.push({
          date,
          description: 'VP storage fee',
          amount,
          broker: 'Swedbank',
        });
        continue;
      }

      // Check for dividends
      const divMatch2024 = details.match(DIVIDEND_REGEX_2024);
      const divMatch2022 = details.match(DIVIDEND_REGEX_2022);
      const divMatch = divMatch2024 || divMatch2022;

      if (divMatch) {
        const company = divMatch[1].trim();
        const isin = divMatch[2];
        const perShare = parseFloat(divMatch[3]);
        const taxRate = parseFloat(divMatch[4]);
        const netAmount = amount; // K = credit, amount received
        const grossAmount = netAmount / (1 - taxRate / 100);
        const taxWithheld = grossAmount - netAmount;
        const resolved = ISIN_TO_SYMBOL[isin];

        dividends.push({
          date,
          symbol: resolved?.symbol || isin,
          company: resolved?.name || company,
          grossAmount,
          taxWithheld,
          netAmount,
          currency: 'EUR',
          perShare,
          taxRate,
          broker: 'Swedbank',
          isin,
        });
        continue;
      }

      // Check for stock trades
      const tradeMatch = details.match(TRADE_REGEX);
      if (tradeMatch) {
        const symbol = tradeMatch[1];
        const signedQty = parseInt(tradeMatch[2], 10);
        const price = parseFloat(tradeMatch[3]);
        const counterparty = tradeMatch[4].trim();

        // Exclude fund operations
        if (isFundOperation(details)) continue;
        if (FUND_CODES.has(symbol)) continue;
        // Exclude if counterparty is Swedbank AB (fund redemption)
        if (counterparty === 'SWEDBANK, AB') continue;

        const side: 'BUY' | 'SELL' = signedQty > 0 ? 'BUY' : 'SELL';
        const quantity = Math.abs(signedQty);

        trades.push({
          date,
          symbol,
          description: ISIN_TO_SYMBOL[Object.keys(ISIN_TO_SYMBOL).find(k => ISIN_TO_SYMBOL[k].symbol === symbol) || '']?.name || symbol,
          side,
          quantity,
          price,
          currency: 'EUR',
          fxRateToEUR: 1.0,
          totalEUR: amount, // Amount from bank statement is the total
          commission: dk === 'D' && side === 'BUY' ? 0 : 0, // Commission tracked separately
          taxes: 0,
          broker: 'Swedbank',
          assetClass: 'STK',
          country: 'LT',
          rawSourceId: row[8]?.trim() || undefined,
        });
      }

      // Skip transfers, opening/closing balances, and other non-investment rows
    }
  }

  return { trades, dividends, fees };
}
