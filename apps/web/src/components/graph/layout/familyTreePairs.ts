/**
 * @file Family-tree layout math: familyTreePairs.
 */

import type { RelationshipRecord } from "../../../lib/api";
import type { SpousePair } from "./familyTreeTypes";

const derivePairsByType = (
  relationships: RelationshipRecord[],
  relationshipType: "SPOUSE_OF" | "SIBLING_OF"
) => {
  const pairs = new Map<string, SpousePair>();
  for (const relationship of relationships) {
    if (relationship.type !== relationshipType) {
      continue;
    }
    const firstPersonId =
      relationship.fromPersonId < relationship.toPersonId
        ? relationship.fromPersonId
        : relationship.toPersonId;
    const secondPersonId =
      relationship.fromPersonId < relationship.toPersonId
        ? relationship.toPersonId
        : relationship.fromPersonId;
    if (!firstPersonId || !secondPersonId) {
      continue;
    }
    pairs.set(`${firstPersonId}|${secondPersonId}`, { firstPersonId, secondPersonId });
  }
  return [...pairs.values()];
};

export const deriveSpousePairs = (relationships: RelationshipRecord[]) =>
  derivePairsByType(relationships, "SPOUSE_OF");

export const deriveSiblingPairs = (relationships: RelationshipRecord[]) =>
  derivePairsByType(relationships, "SIBLING_OF");
