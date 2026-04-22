import type { ImmichPerson } from "./api";

/** Graph/search label: Treemich primary or formatted when `displayName` is set, else Immich `name`. */
export const getPersonDisplayLabel = (person: ImmichPerson): string =>
  person.displayName?.trim() ? person.displayName : person.name;
