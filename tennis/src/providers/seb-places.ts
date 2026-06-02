export const SEB_VALID_PLACES = [2, 18, 5, 20, 8] as const;
export type SebPlaceId = (typeof SEB_VALID_PLACES)[number];

export interface SebPlaceOption {
  id: SebPlaceId;
  label: string;
  description: string;
}

/** Court groups returned by placeInfoBatch (discovered via API). */
export const SEB_PLACE_OPTIONS: SebPlaceOption[] = [
  { id: 2, label: 'SEB indoor hard', description: 'SEB 01–15' },
  { id: 18, label: 'SEB center & hard', description: 'Centrinis (CC), SEB 16–21' },
  { id: 8, label: 'SEB carpet', description: 'K1–K6' },
  { id: 5, label: 'Bernardinų sodas clay', description: 'BS 01–10' },
  { id: 20, label: 'Bernardinų sodas synthetic grass', description: 'BS 11–12' },
];

export const DEFAULT_SEB_PLACES: SebPlaceId[] = [2, 18];

export function normalizeSebPlaces(places: number[] | undefined): SebPlaceId[] {
  if (!places?.length) return [...DEFAULT_SEB_PLACES];
  const valid = new Set<number>(SEB_VALID_PLACES);
  const filtered = places.filter((p): p is SebPlaceId => valid.has(p));
  return filtered.length > 0 ? filtered : [...DEFAULT_SEB_PLACES];
}
