import type { Gender, Person, RelationshipRecord } from "../../lib/api";
import { inverseRelationshipType } from "../graph/layout";
import { getRelativeRelationshipLabel } from "../personDetail/personDetailHelpers";

export const directRelationshipHint = (
  relationships: RelationshipRecord[],
  selectedPersonId: string | null,
  candidate: Person
): string | null => {
  if (!selectedPersonId || selectedPersonId === candidate.id) {
    return null;
  }
  const gender = (candidate.profile?.gender ?? "UNKNOWN") as Gender;
  for (const relationship of relationships) {
    if (relationship.fromPersonId === selectedPersonId && relationship.toPersonId === candidate.id) {
      return getRelativeRelationshipLabel(relationship.type, gender);
    }
    if (relationship.fromPersonId === candidate.id && relationship.toPersonId === selectedPersonId) {
      return getRelativeRelationshipLabel(inverseRelationshipType(relationship.type), gender);
    }
  }
  return null;
};
