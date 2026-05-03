const EUR = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const EUR_FULL = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const PCT = new Intl.NumberFormat('en-IE', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const NUM = new Intl.NumberFormat('en-IE', {
  maximumFractionDigits: 4,
});

export function money(n: number | null | undefined, opts?: { precise?: boolean }): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return (opts?.precise ? EUR_FULL : EUR).format(n);
}

export function signedMoney(n: number | null | undefined, opts?: { precise?: boolean }): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const f = (opts?.precise ? EUR_FULL : EUR).format(Math.abs(n));
  return n >= 0 ? `+${f}` : `-${f}`;
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return PCT.format(n);
}

export function signedPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const f = PCT.format(Math.abs(n));
  return n >= 0 ? `+${f}` : `-${f}`;
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return NUM.format(n);
}

export function currencyFmt(n: number | null | undefined, ccy: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: ccy,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${ccy}`;
  }
}

export function pnlColor(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'dimmed';
  if (n > 0) return 'teal';
  if (n < 0) return 'red';
  return 'dimmed';
}
