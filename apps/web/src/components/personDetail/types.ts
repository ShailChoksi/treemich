import type { RelationshipRecord, RelationshipType } from "../../lib/api";

export type RelativeItem = {
  key: string;
  relatedId: string;
  relatedName: string;
  displayRelationshipType: RelationshipType;
  editableRelationshipType: RelationshipType;
  relationshipLabel: string;
  record: RelationshipRecord;
};

export type PrimaryFamilyOption = {
  key: string;
  label: string;
};
