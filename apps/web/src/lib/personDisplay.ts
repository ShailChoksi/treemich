/**
 * @packageDocumentation
 * Display name resolution for Immich-backed people in graph and search UI.
 */

import type { Person } from "./api";

/** Graph/search label: Treemich primary or formatted when `displayName` is set, else Immich `name`. */
export const getPersonDisplayLabel = (person: Person): string =>
  person.displayName?.trim() ? person.displayName : person.name;

/**
 * `POST /graph/layout` requires a non-empty `name` for each person. Immich can have an empty
 * `name` with no `displayName`, which would fail Zod; use a stable fallback for layout and revision keys.
 */
export const getPersonNameForGraphLayout = (person: Person): string => {
  const label = getPersonDisplayLabel(person).trim();
  return label.length > 0 ? label : "Unnamed person";
};
