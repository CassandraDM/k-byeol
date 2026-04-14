export const DEFAULT_COORDINATES = { latitude: 48.8566, longitude: 2.3522 }; // Paris

export async function getCityCoordinates(
  cityCode: string,
): Promise<{ latitude: number; longitude: number }> {
  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes/${cityCode}?fields=centre`,
    );
    if (!res.ok) return DEFAULT_COORDINATES;

    const data = await res.json();
    const [lng, lat] = data.centre.coordinates; // GeoJSON: [lng, lat]
    return { latitude: lat, longitude: lng };
  } catch {
    return DEFAULT_COORDINATES;
  }
}
