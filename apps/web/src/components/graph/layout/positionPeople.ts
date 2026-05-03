/**
 * @file Family-tree layout math: positionPeople.
 */

import { positionGenerationTreePeople } from "@treemich/shared";
import type { Person, PhotoCluster, RelationshipRecord, TreeLayoutPreferences } from "../../../lib/api";
import type { GraphLayoutMode, NodePosition } from "./types";
import { positionPeopleByPhotoClusters } from "./photoLayout";

export const positionPeople = (
  people: Person[],
  relationships: RelationshipRecord[],
  options?: {
    mode?: GraphLayoutMode;
    photoClusters?: PhotoCluster[];
    primaryFamilyUnitByPersonId?: Record<string, string>;
    treeLayoutPreferences?: TreeLayoutPreferences;
  }
) => {
  if (options?.mode === "photo") {
    return positionPeopleByPhotoClusters(people, options.photoClusters ?? []);
  }

  return positionGenerationTreePeople(people, relationships, {
    primaryFamilyUnitByPersonId: options?.primaryFamilyUnitByPersonId,
    treeLayoutPreferences: options?.treeLayoutPreferences
  }).map((entry) => ({
    person: entry.person,
    position: entry.position as NodePosition
  }));
};
