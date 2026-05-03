import Papa from 'papaparse';

/**
 * Parse a CSV string into an array of cell arrays. Uses papaparse with the
 * tolerant defaults tuned for the weird, quote-heavy Swedbank exports and
 * the multi-section Interactive Brokers statements.
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

/** Parse a row with a leading header row, returning array of `{header: value}`. */
export function parseCsvWithHeader(text: string): Array<Record<string, string>> {
  const result = Papa.parse<Record<string, string>>(text, {
    skipEmptyLines: true,
    header: true,
    delimiter: ',',
    dynamicTyping: false,
  });
  return result.data ?? [];
}
