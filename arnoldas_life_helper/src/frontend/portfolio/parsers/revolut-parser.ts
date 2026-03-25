import Papa from 'papaparse';
import type { NormalizedTrade } from '../types';
import { getFxRate } from '../fx';

// Strip currency symbols and commas from amount strings
function parseAmount(str: string): number {
  if (!str) return 0;
  const cleaned = str
    .replace(/^US\$/, '')
    .replace(/^[€$]/, '')
    .replace(/,/g, '')
    .replace(/^-/, '')
    .trim();
  const value = parseFloat(cleaned) || 0;
  return str.includes('-') ? -value : value;
}

// Parse Revolut date: "Jan 14, 2025" → "2025-01-14"
function parseRevolutDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Detect currency from amount string
function detectCurrency(amountStr: string): string {
  if (amountStr.startsWith('US$') || amountStr.startsWith('$')) return 'USD';
  if (amountStr.startsWith('€')) return 'EUR';
  return 'USD'; // default
}

interface BrokerageRow {
  dateAcquired: string;
  dateSold: string;
  name: string;
  symbol: string;
  isin: string;
  country: string;
  qty: number;
  costBasis: number;
  grossProceeds: number;
  pnl: number;
  currency: string;
}

function parseBrokerageSection(sectionText: string): BrokerageRow[] {
  const lines = sectionText.split('\n').filter(l => l.trim());
  const rows: BrokerageRow[] = [];

  // Find the header line (contains "Date acquired")
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Date acquired')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return rows;

  // Parse data rows after header
  const dataText = lines.slice(headerIdx).join('\n');
  const result = Papa.parse<string[]>(dataText, { header: false, skipEmptyLines: true });

  // Skip header row (index 0)
  for (let i = 1; i < result.data.length; i++) {
    const cols = result.data[i];
    if (!cols || cols.length < 7) continue;

    const costBasisStr = cols[7] || '';
    const grossProceedsStr = cols[10] || '';
    const pnlStr = cols[13] || '';

    rows.push({
      dateAcquired: cols[0]?.trim() || '',
      dateSold: cols[1]?.trim() || '',
      name: cols[2]?.trim() || '',
      symbol: cols[3]?.trim() || '',
      isin: cols[4]?.trim() || '',
      country: cols[5]?.trim() || '',
      qty: parseFloat(cols[6]) || 0,
      costBasis: Math.abs(parseAmount(costBasisStr)),
      grossProceeds: Math.abs(parseAmount(grossProceedsStr)),
      pnl: parseAmount(pnlStr),
      currency: detectCurrency(costBasisStr),
    });
  }

  return rows;
}

interface CryptoRow {
  dateAcquired: string;
  dateSold: string;
  tokenName: string;
  qty: number;
  costBasis: number;
  grossProceeds: number;
  pnl: number;
}

function parseCryptoSection(sectionText: string): CryptoRow[] {
  const lines = sectionText.split('\n').filter(l => l.trim());
  const rows: CryptoRow[] = [];

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Date acquired')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return rows;

  const dataText = lines.slice(headerIdx).join('\n');
  const result = Papa.parse<string[]>(dataText, { header: false, skipEmptyLines: true });

  for (let i = 1; i < result.data.length; i++) {
    const cols = result.data[i];
    if (!cols || cols.length < 7) continue;

    rows.push({
      dateAcquired: cols[0]?.trim() || '',
      dateSold: cols[1]?.trim() || '',
      tokenName: cols[2]?.trim() || '',
      qty: parseFloat(cols[3]) || 0,
      costBasis: Math.abs(parseAmount(cols[4] || '')),
      grossProceeds: Math.abs(parseAmount(cols[5] || '')),
      pnl: parseAmount(cols[6] || ''),
    });
  }

  return rows;
}

export function parseRevolut(
  files: Record<string, string>
): { trades: NormalizedTrade[] } {
  const trades: NormalizedTrade[] = [];

  const csv = Object.values(files)[0];
  if (!csv) return { trades };

  // Split by double newline to get sections
  const sections = csv.split(/\n\s*\n/);

  for (const section of sections) {
    const firstLine = section.trim().split('\n')[0] || '';

    // Brokerage sells sections
    if (firstLine.startsWith('Transactions for Brokerage Account sells')) {
      const rows = parseBrokerageSection(section);
      for (const row of rows) {
        const fxRate = getFxRate(row.currency);

        // Create a BUY (at acquisition date at cost basis)
        trades.push({
          date: parseRevolutDate(row.dateAcquired),
          symbol: row.symbol,
          description: row.name,
          side: 'BUY',
          quantity: row.qty,
          price: row.qty > 0 ? row.costBasis / row.qty : 0,
          currency: row.currency,
          fxRateToEUR: fxRate,
          totalEUR: row.costBasis * fxRate,
          commission: 0,
          taxes: 0,
          broker: 'Revolut',
          assetClass: 'STK',
          country: row.country || '',
          isin: row.isin || undefined,
        });

        // Create a SELL (at sold date at gross proceeds)
        trades.push({
          date: parseRevolutDate(row.dateSold),
          symbol: row.symbol,
          description: row.name,
          side: 'SELL',
          quantity: row.qty,
          price: row.qty > 0 ? row.grossProceeds / row.qty : 0,
          currency: row.currency,
          fxRateToEUR: fxRate,
          totalEUR: row.grossProceeds * fxRate,
          commission: 0,
          taxes: 0,
          broker: 'Revolut',
          assetClass: 'STK',
          country: row.country || '',
          isin: row.isin || undefined,
        });
      }
    }

    // Crypto section
    if (firstLine.startsWith('Transactions for Crypto')) {
      const rows = parseCryptoSection(section);
      const usdRate = getFxRate('USD');

      for (const row of rows) {
        // BUY at cost
        trades.push({
          date: parseRevolutDate(row.dateAcquired),
          symbol: row.tokenName,
          description: row.tokenName,
          side: 'BUY',
          quantity: row.qty,
          price: row.qty > 0 ? row.costBasis / row.qty : 0,
          currency: 'USD',
          fxRateToEUR: usdRate,
          totalEUR: row.costBasis * usdRate,
          commission: 0,
          taxes: 0,
          broker: 'Revolut',
          assetClass: 'CRYPTO',
          country: '',
        });

        // SELL at proceeds
        trades.push({
          date: parseRevolutDate(row.dateSold),
          symbol: row.tokenName,
          description: row.tokenName,
          side: 'SELL',
          quantity: row.qty,
          price: row.qty > 0 ? row.grossProceeds / row.qty : 0,
          currency: 'USD',
          fxRateToEUR: usdRate,
          totalEUR: row.grossProceeds * usdRate,
          commission: 0,
          taxes: 0,
          broker: 'Revolut',
          assetClass: 'CRYPTO',
          country: '',
        });
      }
    }
  }

  return { trades };
}
