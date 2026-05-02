/**
 * @packageDocumentation
 * Display name resolution for Treemich-owned people in graph and search UI.
 */

import type { Person } from "./api";

/** Graph/search label: Treemich primary or formatted when `displayName` is set, else API `name`. */
export const getPersonDisplayLabel = (person: Person): string =>
  person.displayName?.trim() ? person.displayName : person.name;

/** Immich external identity display names usable as Tree search aliases. */
export const collectImmichSearchAliases = (person: Person): string[] => {
  const identities = person.externalIdentities ?? [];
  return identities
    .filter((identity) => identity.provider === "IMMICH" && identity.displayName?.trim())
    .map((identity) => identity.displayName!.trim());
};

/** Whether a person matches a normalized Tree search string (display name, API name, or Immich aliases). */
export const personMatchesGraphSearchQuery = (person: Person, queryNormalized: string): boolean => {
  if (!queryNormalized) {
    return false;
  }
  const label = getPersonDisplayLabel(person).toLowerCase();
  const apiName = person.name.toLowerCase();
  if (label.includes(queryNormalized) || apiName.includes(queryNormalized)) {
    return true;
  }
  return collectImmichSearchAliases(person).some((alias) => alias.toLowerCase().includes(queryNormalized));
};

/**
 * `POST /graph/layout` requires a non-empty `name` for each person. Imported or placeholder people can have
 * an empty `name` with no `displayName`, which would fail Zod; use a stable fallback for layout and revision keys.
 */
export const getPersonNameForGraphLayout = (person: Person): string => {
  const label = getPersonDisplayLabel(person).trim();
  return label.length > 0 ? label : "Unnamed person";
};
