import type { Broker } from '../../shared/types';
import { BROKERS, BROKER_KEYS } from '../../shared/brokers';

export const BASE = (window as any).INGRESS_PATH || '';

export const BROKER_OPTIONS = BROKER_KEYS.map(key => ({
  value: key,
  label: BROKERS[key].label,
}));

export function brokerLabel(broker: Broker | string): string {
  return BROKERS[broker as Broker]?.label ?? broker;
}
