import type { RelationshipType } from "../../lib/api";

export type RelationshipKind =
  | "PARENT_CHILD"
  | "SPOUSE"
  | "SIBLING"
  | "FRIEND"
  | "PET"
  | "CO_OCCURRENCE";
export type GraphFilter = "parentChild" | "spouse" | "sibling" | "friends" | "pets";
export type GraphFilterVisibility = Record<GraphFilter, boolean>;

export const defaultGraphFilterVisibility: GraphFilterVisibility = {
  parentChild: true,
  spouse: true,
  sibling: true,
  friends: true,
  pets: true
};

export const relationshipKindForType = (type: RelationshipType): RelationshipKind => {
  if (type === "FRIEND_OF") {
    return "FRIEND";
  }
  if (type === "PET_OF") {
    return "PET";
  }
  if (type === "SPOUSE_OF") {
    return "SPOUSE";
  }
  if (type === "SIBLING_OF") {
    return "SIBLING";
  }
  return "PARENT_CHILD";
};

export const relationshipStyleByKind: Record<RelationshipKind, { color: string; opacity: number }> = {
  PARENT_CHILD: { color: "#475569", opacity: 0.62 },
  SPOUSE: { color: "#f59e0b", opacity: 0.78 },
  SIBLING: { color: "#34d399", opacity: 0.75 },
  FRIEND: { color: "#60a5fa", opacity: 0.7 },
  PET: { color: "#f472b6", opacity: 0.78 },
  CO_OCCURRENCE: { color: "#a78bfa", opacity: 0.65 }
};

export const relationshipFilterForType = (type: RelationshipType): GraphFilter => {
  if (type === "FRIEND_OF") {
    return "friends";
  }
  if (type === "PET_OF") {
    return "pets";
  }
  if (type === "SPOUSE_OF") {
    return "spouse";
  }
  if (type === "SIBLING_OF") {
    return "sibling";
  }
  return "parentChild";
};
