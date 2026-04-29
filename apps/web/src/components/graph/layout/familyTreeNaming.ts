/**
 * @file Family-tree layout math: familyTreeNaming.
 */

import type { Person } from "../../../lib/api";

export const personNameById = (peopleById: Map<string, Person>, personId: string) =>
  peopleById.get(personId)?.name ?? personId;

export const sortPersonIdsByName = (ids: Iterable<string>, peopleById: Map<string, Person>) =>
  [...ids].sort((left, right) =>
    personNameById(peopleById, left).localeCompare(personNameById(peopleById, right))
  );
