import { DEFAULT_COORDINATES, getCityCoordinates } from '@/utils/geo';

const mockFetch = (impl: () => Promise<unknown>) => {
  globalThis.fetch = jest.fn(impl) as unknown as typeof fetch;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getCityCoordinates', () => {
  it('converts the GeoJSON centre ([lng, lat]) to { latitude, longitude }', async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        // Bordeaux, in the order the geo.api.gouv.fr response uses.
        json: () =>
          Promise.resolve({ centre: { coordinates: [-0.5792, 44.8378] } }),
      }),
    );

    await expect(getCityCoordinates('33063')).resolves.toEqual({
      latitude: 44.8378,
      longitude: -0.5792,
    });
  });

  it('falls back to the default coordinates on a non-OK response', async () => {
    mockFetch(() => Promise.resolve({ ok: false, status: 404 }));
    await expect(getCityCoordinates('99999')).resolves.toEqual(
      DEFAULT_COORDINATES,
    );
  });

  it('falls back to the default coordinates when the network fails', async () => {
    mockFetch(() => Promise.reject(new Error('offline')));
    await expect(getCityCoordinates('33063')).resolves.toEqual(
      DEFAULT_COORDINATES,
    );
  });

  it('falls back rather than throwing when the payload has no centre', async () => {
    mockFetch(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    );
    await expect(getCityCoordinates('33063')).resolves.toEqual(
      DEFAULT_COORDINATES,
    );
  });

  it('calls the commune endpoint with the city code', async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ centre: { coordinates: [2.3522, 48.8566] } }),
      }),
    );

    await getCityCoordinates('75056');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://geo.api.gouv.fr/communes/75056?fields=centre',
    );
  });
});
