import {
  buildEventsQuery,
  countActiveFilters,
  DEFAULT_FILTERS,
  DEFAULT_RADIUS_KM,
  isNarrowed,
  toIsoDate,
  type EventFilters,
} from '@/utils/event-filters';

const PARIS = { latitude: 48.8566, longitude: 2.3522 };

/** DEFAULT_FILTERS is shared state — never mutate it in a test. */
const filters = (overrides: Partial<EventFilters> = {}): EventFilters => ({
  ...DEFAULT_FILTERS,
  ...overrides,
});

describe('countActiveFilters', () => {
  it('counts nothing when everything is at its default', () => {
    expect(countActiveFilters(filters())).toBe(0);
  });

  it('ignores the keyword — it is already visible in the search bar', () => {
    expect(countActiveFilters(filters({ q: 'seoul' }))).toBe(0);
  });

  it('counts each date bound separately', () => {
    expect(countActiveFilters(filters({ dateFrom: new Date(2026, 5, 1) }))).toBe(
      1,
    );
    expect(
      countActiveFilters(
        filters({
          dateFrom: new Date(2026, 5, 1),
          dateTo: new Date(2026, 5, 30),
        }),
      ),
    ).toBe(2);
  });

  it('counts the radius only when it differs from the default', () => {
    expect(countActiveFilters(filters({ radiusKm: DEFAULT_RADIUS_KM }))).toBe(0);
    expect(countActiveFilters(filters({ radiusKm: 5 }))).toBe(1);
  });
});

describe('isNarrowed', () => {
  it('is false on untouched filters', () => {
    expect(isNarrowed(filters())).toBe(false);
  });

  it('is true for a keyword, unlike countActiveFilters', () => {
    expect(isNarrowed(filters({ q: 'bts' }))).toBe(true);
  });

  it('treats a whitespace-only keyword as no keyword', () => {
    expect(isNarrowed(filters({ q: '   ' }))).toBe(false);
  });

  it('is true as soon as one sheet filter is set', () => {
    expect(isNarrowed(filters({ radiusKm: 1 }))).toBe(true);
  });
});

describe('toIsoDate', () => {
  it('formats using the local calendar day, not UTC', () => {
    // 23:30 local on 15 March is 22:30 UTC in Paris — toISOString() happens to
    // agree here, but at 00:30 local it would report the *previous* day. This
    // assertion holds whatever timezone the test runs in.
    expect(toIsoDate(new Date(2026, 2, 15, 23, 30))).toBe('2026-03-15');
  });

  it('zero-pads month and day', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('keeps the same day just after local midnight', () => {
    expect(toIsoDate(new Date(2026, 6, 1, 0, 30))).toBe('2026-07-01');
  });
});

describe('buildEventsQuery', () => {
  const parse = (qs: string) => new URLSearchParams(qs);

  it('always sends the coordinates and the radius', () => {
    const params = parse(buildEventsQuery(PARIS, filters()));
    expect(params.get('lat')).toBe('48.8566');
    expect(params.get('lng')).toBe('2.3522');
    expect(params.get('radiusKm')).toBe(String(DEFAULT_RADIUS_KM));
  });

  it('omits optional params that are not set', () => {
    const params = parse(buildEventsQuery(PARIS, filters()));
    expect(params.has('q')).toBe(false);
    expect(params.has('dateFrom')).toBe(false);
    expect(params.has('dateTo')).toBe(false);
  });

  it('trims the keyword', () => {
    const params = parse(buildEventsQuery(PARIS, filters({ q: '  bts  ' })));
    expect(params.get('q')).toBe('bts');
  });

  it('drops a whitespace-only keyword instead of sending an empty q', () => {
    const params = parse(buildEventsQuery(PARIS, filters({ q: '   ' })));
    expect(params.has('q')).toBe(false);
  });

  it('serialises both date bounds as YYYY-MM-DD', () => {
    const params = parse(
      buildEventsQuery(
        PARIS,
        filters({
          dateFrom: new Date(2026, 8, 1),
          dateTo: new Date(2026, 8, 30),
        }),
      ),
    );
    expect(params.get('dateFrom')).toBe('2026-09-01');
    expect(params.get('dateTo')).toBe('2026-09-30');
  });

  it('percent-encodes a keyword rather than breaking the query string', () => {
    const query = buildEventsQuery(PARIS, filters({ q: 'k-pop & dance' }));
    expect(query).toContain('q=k-pop+%26+dance');
    expect(parse(query).get('q')).toBe('k-pop & dance');
  });

  it('passes SQL wildcards through untouched — escaping is the API job', () => {
    const params = parse(buildEventsQuery(PARIS, filters({ q: '100%_x' })));
    expect(params.get('q')).toBe('100%_x');
  });
});
