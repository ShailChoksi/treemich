import { z } from "zod";
import type { AgeFilter, InterpreterIntent } from "./search/interpreter.js";

export const relationshipTypes = [
  "PARENT_OF",
  "CHILD_OF",
  "SPOUSE_OF",
  "SIBLING_OF",
  "FRIEND_OF",
  "PET_OF"
] as const;
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

export type TreemichPersonProfile = {
  immichPersonId: string;
  gender: GenderValue;
  birthDateOverride?: string | null;
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

export const cooccurrenceJobStatusValues = ["PENDING", "RUNNING", "COMPLETED", "FAILED"] as const;
export const cooccurrenceJobStatusSchema = z.enum(cooccurrenceJobStatusValues);
export type CooccurrenceJobStatus = (typeof cooccurrenceJobStatusValues)[number];

export type CooccurrenceEdgeRecord = {
  id: string;
  personAId: string;
  personBId: string;
  sharedPhotos: number;
  score: number;
  personAPhotoCount: number;
  personBPhotoCount: number;
  computedAt: string;
};

export type CooccurrenceEdgesResponse = {
  edges: CooccurrenceEdgeRecord[];
  nextCursor: string | null;
};

export type CooccurrenceScheduleInfo = {
  refreshEnabled: boolean;
  refreshIntervalDays: number;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
};

export type CooccurrenceJobResponse = {
  job: {
    id: string;
    status: CooccurrenceJobStatus;
    sourcePhotoCount?: number | null;
    edgeCount?: number | null;
    progress?: number | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  schedule: CooccurrenceScheduleInfo;
};

export type AuthUser = {
  id: string;
  immichUserId: string;
  email: string;
  name: string;
};

export type LinkStatus = {
  linked: boolean;
  immichBaseUrl?: string;
  immichEmail?: string;
  immichName?: string;
};

export type AuthState = {
  authenticated: boolean;
  user?: AuthUser;
  linkStatus?: LinkStatus;
};

export type SearchRelationshipsResponse = {
  parsed?: {
    intent: InterpreterIntent;
    sourceName: string;
    requiredGender?: "MALE" | "FEMALE";
    hops: RelationshipType[];
    ageFilter?: AgeFilter;
  };
  sourceCandidates?: ImmichPerson[];
  matches?: Array<{
    person: ImmichPerson;
    profile?: TreemichPersonProfile | null;
  }>;
  message?: string;
};

export const graphFilterVisibilitySchema = z.object({
  parentChild: z.boolean(),
  spouse: z.boolean(),
  sibling: z.boolean(),
  friends: z.boolean(),
  pets: z.boolean()
});

export const familyViewStyleValues = [
  "generationTree",
  "centeredRelationshipMap",
  "hybridTreeList",
  "cleaned3D"
] as const;
export const familyViewStyleSchema = z.enum(familyViewStyleValues);

export const cooccurrencePreferencesSchema = z.object({
  refreshEnabled: z.boolean(),
  refreshIntervalDays: z.number().int().min(1).max(90)
});
export type CooccurrencePreferences = z.infer<typeof cooccurrencePreferencesSchema>;

export const defaultCooccurrencePreferences: CooccurrencePreferences = {
  refreshEnabled: true,
  refreshIntervalDays: 7
};

export const userPreferencesSchema = z.object({
  graphFilterVisibility: graphFilterVisibilitySchema.optional(),
  familyViewStyle: familyViewStyleSchema.optional(),
  dismissedSuggestions: z.array(z.string()).optional(),
  cooccurrence: cooccurrencePreferencesSchema.optional()
});

export type GraphFilterVisibility = z.infer<typeof graphFilterVisibilitySchema>;
export type FamilyViewStyle = z.infer<typeof familyViewStyleSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
