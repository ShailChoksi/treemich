import type { ImmichPerson, LifeEventRecord, RelationshipRecord } from "./api";

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

export const toDateInputValueFromEvent = (
  event: Pick<LifeEventRecord, "year" | "month" | "day"> | null | undefined
) => {
  if (event?.year == null || event.month == null || event.day == null) {
    return "";
  }
  return `${String(event.year).padStart(4, "0")}-${String(event.month).padStart(2, "0")}-${String(event.day).padStart(2, "0")}`;
};

type IsoDateParts = { year: number; month: number; day: number };

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

export const buildBirthPlaceInput = (city: string | null, country: string | null) => {
  if (!city && !country) {
    return null;
  }
  const cityPart = city?.trim() ? city.trim() : null;
  const countryPart = country?.trim() ? country.trim() : null;
  const countryCode = countryPart && countryPart.length === 2 ? countryPart.toUpperCase() : null;
  const placeName = [cityPart, countryPart].filter((value): value is string => Boolean(value)).join(", ");
  return {
    name: placeName || cityPart || countryPart || "Birth place",
    locality: cityPart,
    countryCode
  };
};

export const deriveProfileDisplayValues = (
  person: ImmichPerson,
  lifeEvents: LifeEventRecord[] | undefined
): { birthDate: string; deathDate: string; birthCity: string; birthCountry: string } => {
  const fallback = {
    birthDate: toDateInputValue(person.birthDate),
    deathDate: toDateInputValue(person.profile?.deathDate),
    birthCity: person.profile?.birthCity ?? "",
    birthCountry: person.profile?.birthCountry ?? ""
  };
  if (!lifeEvents) {
    return fallback;
  }
  const birthEvent = lifeEvents.find((event) => event.eventType === "BIRTH") ?? null;
  const deathEvent = lifeEvents.find((event) => event.eventType === "DEATH") ?? null;
  return {
    birthDate: birthEvent ? toDateInputValueFromEvent(birthEvent) : fallback.birthDate,
    deathDate: deathEvent ? toDateInputValueFromEvent(deathEvent) : fallback.deathDate,
    birthCity: birthEvent ? (birthEvent.place?.locality ?? "") : fallback.birthCity,
    birthCountry: birthEvent ? (birthEvent.place?.countryCode ?? "") : fallback.birthCountry
  };
};

/**
 * Marriage / divorce shown in the relationship editor: life-event dates first, then legacy relationship columns.
 */
export const deriveSpouseDatesFromRelationshipEvents = (
  events: LifeEventRecord[],
  legacy: Pick<RelationshipRecord, "marriageAnniversaryDate" | "divorceDate">
): { marriage: string; divorce: string } => {
  const marriageEvent = events.find((e) => e.eventType === "MARRIAGE") ?? null;
  const divorceEvent = events.find((e) => e.eventType === "DIVORCE") ?? null;
  return {
    marriage: marriageEvent
      ? toDateInputValueFromEvent(marriageEvent)
      : toDateInputValue(legacy.marriageAnniversaryDate),
    divorce: divorceEvent ? toDateInputValueFromEvent(divorceEvent) : toDateInputValue(legacy.divorceDate)
  };
};
