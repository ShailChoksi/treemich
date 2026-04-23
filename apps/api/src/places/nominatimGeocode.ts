/**
 * @file Shared Nominatim forward-geocode helper (rate-limit friendly; used by birth geocode and scripts).
 */

const USER_AGENT = "Treemich/1.0 (+https://github.com/treemich/treemich)";

/** Forward-geocode a free-text place query; returns null on failure or empty result. */
export async function geocodePlaceQuery(
  query: string
): Promise<{ latitude: number; longitude: number } | null> {
  const q = query.trim();
  if (!q) {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT
        },
        signal: controller.signal
      }
    );
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = body[0];
    if (!first) {
      return null;
    }
    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return { latitude, longitude };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
