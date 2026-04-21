import type { ImmichPerson } from "../../../lib/api";

export const personNameById = (peopleById: Map<string, ImmichPerson>, personId: string) =>
  peopleById.get(personId)?.name ?? personId;

export const sortPersonIdsByName = (ids: Iterable<string>, peopleById: Map<string, ImmichPerson>) =>
  [...ids].sort((left, right) =>
    personNameById(peopleById, left).localeCompare(personNameById(peopleById, right))
  );
