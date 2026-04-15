import type { RelationshipType } from "../../lib/api";

export type RelationshipKind = "PARENT_CHILD" | "SPOUSE" | "SIBLING" | "CO_OCCURRENCE";

export const relationshipKindForType = (type: RelationshipType): RelationshipKind => {
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
  CO_OCCURRENCE: { color: "#a78bfa", opacity: 0.65 }
};
