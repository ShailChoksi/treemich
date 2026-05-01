import type { PersonRecord } from "@treemich/shared";

/** Lower tuple sorts first (better match). */
export type PersonSearchSortKey = readonly [number, string, string];

export const comparePersonSearchSortKeys = (
  left: PersonSearchSortKey,
  right: PersonSearchSortKey
): number => {
  if (left[0] !== right[0]) {
    return left[0] - right[0];
  }
  const nameCmp = left[1].localeCompare(right[1]);
  if (nameCmp !== 0) {
    return nameCmp;
  }
  return left[2].localeCompare(right[2]);
};

const includesInsensitive = (haystack: string | null | undefined, needle: string) =>
  haystack != null && haystack.toLowerCase().includes(needle);

const equalsInsensitive = (haystack: string | null | undefined, needle: string) =>
  haystack != null && haystack.toLowerCase() === needle;

const startsInsensitive = (haystack: string | null | undefined, needle: string) =>
  haystack != null && haystack.toLowerCase().startsWith(needle);

/**
 * Deterministic relevance tier for people search (lower is better), then name, then id.
 */
export const personRecordSearchSortKey = (person: PersonRecord, rawQuery: string): PersonSearchSortKey => {
  const q = rawQuery.trim().toLowerCase();
  const display = person.name?.trim() ?? "";
  const given = person.profile?.givenName?.trim() ?? "";
  const surname = person.profile?.surname?.trim() ?? "";
  const nick = person.profile?.nicknames?.trim() ?? "";
  const combined = [given, surname].filter(Boolean).join(" ").trim();

  let tier = 80;
  if (equalsInsensitive(display, q)) {
    tier = 0;
  } else if (startsInsensitive(display, q)) {
    tier = 5;
  } else if (equalsInsensitive(given, q) || equalsInsensitive(surname, q)) {
    tier = 8;
  } else if (equalsInsensitive(combined, q)) {
    tier = 9;
  } else if (startsInsensitive(combined, q)) {
    tier = 12;
  } else if (includesInsensitive(display, q)) {
    tier = 20;
  } else if (includesInsensitive(given, q) || includesInsensitive(surname, q)) {
    tier = 30;
  } else if (includesInsensitive(nick, q)) {
    tier = 35;
  } else if (person.externalIdentities?.some((identity) => includesInsensitive(identity.displayName, q))) {
    tier = 40;
  }

  const tieBreakName = display.toLowerCase() || combined.toLowerCase() || person.id;
  return [tier, tieBreakName, person.id] as const;
};
