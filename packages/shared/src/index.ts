import { z } from "zod";

export const relationshipTypes = ["PARENT_OF", "CHILD_OF", "SPOUSE_OF", "SIBLING_OF"] as const;
export type RelationshipType = (typeof relationshipTypes)[number];

export const genderValues = ["MALE", "FEMALE", "OTHER", "UNKNOWN"] as const;
export type GenderValue = (typeof genderValues)[number];

export const genderSchema = z.enum(genderValues);
export const relationshipTypeSchema = z.enum(relationshipTypes);

export type ImmichPerson = {
  id: string;
  name: string;
  birthDate?: string | null;
  thumbnailPath?: string | null;
};

export type RelationshipRecord = {
  fromPersonId: string;
  toPersonId: string;
  type: RelationshipType;
};

export type PhotoCooccurrenceEdge = {
  personAId: string;
  personBId: string;
  sharedPhotos: number;
  score: number;
};

export type PhotoCluster = {
  id: string;
  personIds: string[];
  size: number;
};

export type PhotoCooccurrenceResponse = {
  clusters: PhotoCluster[];
  edges: PhotoCooccurrenceEdge[];
  computedAt: string;
  sourcePhotoCount: number;
};
