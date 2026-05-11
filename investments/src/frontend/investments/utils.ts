export const BASE = (window as any).INGRESS_PATH || '';

export const BROKERS = [
  { value: 'swedbank', label: 'Swedbank' },
  { value: 'interactive-brokers', label: 'Interactive Brokers' },
];

export const BROKER_LABEL: Record<string, string> = Object.fromEntries(
  BROKERS.map(b => [b.value, b.label]),
);
