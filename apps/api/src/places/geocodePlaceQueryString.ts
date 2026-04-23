/**
 * @file Builds a single Nominatim search string from place row fields (used by geocode-missing-places script).
 */

export type PlaceRowGeocodeParts = {
  name: string;
  locality: string | null;
  adminArea: string | null;
  countryCode: string | null;
};

/** Dedupe trimmed non-empty parts and join for forward-geocode queries. */
export function geocodeQueryStringFromPlaceParts(row: PlaceRowGeocodeParts): string {
  const parts = [row.locality, row.adminArea, row.countryCode, row.name].filter((p): p is string =>
    Boolean(p?.trim())
  );
  return [...new Set(parts.map((p) => p.trim()))].join(", ");
}
