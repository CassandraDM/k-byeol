/**
 * Filtering rules for the events map.
 *
 * Kept out of the sheet component on purpose: none of this needs React or a
 * renderer, so pulling it into its own module makes it directly unit-testable
 * and lets other screens reuse it without mounting UI.
 */

/** Everything the map screen can narrow events down by. */
export interface EventFilters {
  /** Keyword typed in the search bar (lives here so "reset" clears it too). */
  q: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  radiusKm: number;
}

export const DEFAULT_RADIUS_KM = 50;

export const DEFAULT_FILTERS: EventFilters = {
  q: '',
  dateFrom: null,
  dateTo: null,
  radiusKm: DEFAULT_RADIUS_KM,
};

/**
 * How many filters differ from the defaults — drives the badge on the filter
 * button.
 *
 * The keyword is deliberately excluded: it's already visible in the search
 * bar, so counting it would flag the button for something that isn't hidden
 * behind it. Use `isNarrowed` when you need "is anything filtering at all".
 */
export function countActiveFilters(filters: EventFilters): number {
  let count = 0;
  if (filters.dateFrom) count += 1;
  if (filters.dateTo) count += 1;
  if (filters.radiusKm !== DEFAULT_RADIUS_KM) count += 1;
  return count;
}

/** True when anything at all is narrowing the results, keyword included. */
export function isNarrowed(filters: EventFilters): boolean {
  return countActiveFilters(filters) > 0 || filters.q.trim().length > 0;
}

/** YYYY-MM-DD in the user's own timezone (toISOString would shift the day). */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Serialises filters into the query string `GET /events` expects. */
export function buildEventsQuery(
  coords: { latitude: number; longitude: number },
  filters: EventFilters,
): string {
  const params = new URLSearchParams({
    lat: String(coords.latitude),
    lng: String(coords.longitude),
    radiusKm: String(filters.radiusKm),
  });

  const keyword = filters.q.trim();
  if (keyword) params.set('q', keyword);
  if (filters.dateFrom) params.set('dateFrom', toIsoDate(filters.dateFrom));
  if (filters.dateTo) params.set('dateTo', toIsoDate(filters.dateTo));

  return params.toString();
}
