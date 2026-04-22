/**
 * @packageDocumentation
 * Date-only and profile-field bridging between Immich strings, `<input type="date">`, and Treemich life events.
 */

import type { LifeEventRecord } from "./api";

/**
 * Produces `YYYY-MM-DD` for an `<input type="date">` from an ISO-ish string, using the calendar date
 * prefix when present to avoid local-timezone shifts.
 */
export const toDateInputValue = (value?: string | null) => {
  if (!value) {
    return "";
  }

  const isoDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDateMatch?.[1]) {
    return isoDateMatch[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
};

/** Builds `YYYY-MM-DD` from structured year/month/day on a life event (or empty if incomplete). */
export const toDateInputValueFromEvent = (
  event: Pick<LifeEventRecord, "year" | "month" | "day"> | null | undefined
) => {
  if (event?.year == null || event.month == null || event.day == null) {
    return "";
  }
  return `${String(event.year).padStart(4, "0")}-${String(event.month).padStart(2, "0")}-${String(event.day).padStart(2, "0")}`;
};

type IsoDateParts = { year: number; month: number; day: number };

/** Strict `YYYY-MM-DD` parse with UTC calendar validation (invalid days → `null`). */
export const parseDateInputToParts = (value: string): IsoDateParts | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
};

/**
 * Builds inline `place` payload for birth sync from quick-edit city/country (two-letter country → `countryCode`).
 */
export const buildBirthPlaceInput = (city: string | null, country: string | null) => {
  if (!city && !country) {
    return null;
  }
  const cityPart = city?.trim() ? city.trim() : null;
  const countryPart = country?.trim() ? country.trim() : null;
  const countryCode = countryPart && countryPart.length === 2 ? countryPart.toUpperCase() : null;
  const adminArea = countryPart && countryPart.length !== 2 ? countryPart : null;
  const placeName = [cityPart, countryPart].filter((value): value is string => Boolean(value)).join(", ");
  return {
    name: placeName || cityPart || countryPart || "Birth place",
    locality: cityPart,
    countryCode,
    adminArea
  };
};

/** Country string for profile quick-edit when only `place.name` has "City, Country" (legacy rows). */
const birthCountryFromPlaceName = (place: { name: string; locality?: string | null }): string => {
  const name = place.name.trim();
  if (!name) {
    return "";
  }
  const locality = place.locality?.trim();
  if (locality) {
    const prefix = `${locality},`;
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
      return name.slice(prefix.length).trim();
    }
  }
  const idx = name.indexOf(",");
  return idx >= 0 ? name.slice(idx + 1).trim() : "";
};

const emptyProfileEventFields = (): {
  birthDate: string;
  deathDate: string;
  birthCity: string;
  birthCountry: string;
} => ({
  birthDate: "",
  deathDate: "",
  birthCity: "",
  birthCountry: ""
});

/**
 * Quick-edit / profile form values: derived only from BIRTH and DEATH life events.
 * When `lifeEvents` is undefined (not loaded yet), returns empty strings — no legacy profile fallback.
 */
export const deriveProfileDisplayValuesFromLifeEvents = (
  lifeEvents: LifeEventRecord[] | undefined
): { birthDate: string; deathDate: string; birthCity: string; birthCountry: string } => {
  if (lifeEvents === undefined) {
    return emptyProfileEventFields();
  }
  const birthEvent = lifeEvents.find((event) => event.eventType === "BIRTH") ?? null;
  const deathEvent = lifeEvents.find((event) => event.eventType === "DEATH") ?? null;
  return {
    birthDate: birthEvent ? toDateInputValueFromEvent(birthEvent) : "",
    deathDate: deathEvent ? toDateInputValueFromEvent(deathEvent) : "",
    birthCity: birthEvent ? (birthEvent.place?.locality ?? "") : "",
    birthCountry: birthEvent?.place
      ? birthEvent.place.countryCode?.trim() ||
        birthEvent.place.adminArea?.trim() ||
        birthCountryFromPlaceName(birthEvent.place)
      : ""
  };
};

/**
 * Marriage / divorce quick-edit fields from relationship-scoped life events only.
 */
export const deriveSpouseDatesFromRelationshipEvents = (
  events: LifeEventRecord[]
): { marriage: string; divorce: string } => {
  const marriageEvent = events.find((e) => e.eventType === "MARRIAGE") ?? null;
  const divorceEvent = events.find((e) => e.eventType === "DIVORCE") ?? null;
  return {
    marriage: marriageEvent ? toDateInputValueFromEvent(marriageEvent) : "",
    divorce: divorceEvent ? toDateInputValueFromEvent(divorceEvent) : ""
  };
};
