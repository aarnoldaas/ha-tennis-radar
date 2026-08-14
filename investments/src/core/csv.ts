import Papa from 'papaparse';

/**
 * Parse a CSV string into an array of cell arrays. Uses papaparse with
 * tolerant defaults tuned for the quote-heavy Swedbank exports and the
 * multi-section Interactive Brokers statements.
 */
export function parseCsvRows(text: string): string[][] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    header: false,
    delimiter: ',',
    dynamicTyping: false,
  });
  return (result.data ?? []).map(row => row.map(c => (c ?? '').toString()));
}
