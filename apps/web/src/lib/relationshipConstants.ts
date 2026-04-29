import type { RelationshipType } from "./api";

export const RELATIONSHIP_TYPES = {
  parentOf: "PARENT_OF",
  childOf: "CHILD_OF",
  spouseOf: "SPOUSE_OF",
  siblingOf: "SIBLING_OF",
  friendOf: "FRIEND_OF",
  petOf: "PET_OF"
} as const satisfies Record<string, RelationshipType>;

export const FAMILY_RELATIONSHIP_TYPES = new Set<RelationshipType>([
  RELATIONSHIP_TYPES.parentOf,
  RELATIONSHIP_TYPES.childOf,
  RELATIONSHIP_TYPES.spouseOf,
  RELATIONSHIP_TYPES.siblingOf
]);
