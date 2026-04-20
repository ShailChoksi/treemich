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

/** Relationship types that participate in family-tree layout topology (matches web `layout` + API graph layout). */
export const graphLayoutTopologyRelationshipTypes = ["PARENT_OF", "CHILD_OF", "SPOUSE_OF"] as const;

const graphLayoutTopologyTypeSet = new Set<RelationshipType>(graphLayoutTopologyRelationshipTypes);

export const filterGraphLayoutTopologyRelationships = <R extends { type: RelationshipType }>(
  relationships: R[]
): R[] => relationships.filter((relationship) => graphLayoutTopologyTypeSet.has(relationship.type));

export const genderValues = ["MALE", "FEMALE", "OTHER", "UNKNOWN"] as const;
export type GenderValue = (typeof genderValues)[number];

export const genderSchema = z.enum(genderValues);
export const relationshipTypeSchema = z.enum(relationshipTypes);
export const graphLayoutModeValues = ["family", "photo"] as const;
export const graphLayoutModeSchema = z.enum(graphLayoutModeValues);

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
  givenName?: string | null;
  surname?: string | null;
  nicknames?: string | null;
  deathDate?: string | null;
  birthCity?: string | null;
  birthCountry?: string | null;
};

export type RelationshipRecord = {
  fromPersonId: string;
  toPersonId: string;
  type: RelationshipType;
  marriageAnniversaryDate?: string | null;
  divorceDate?: string | null;
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

/** Legacy values accepted from stored preferences/API; normalized to generation tree only. */
export const legacyFamilyViewStyleValues = [
  "generationTree",
  "centeredRelationshipMap",
  "hybridTreeList",
  "cleaned3D"
] as const;
const legacyFamilyViewStyleSchema = z.enum(legacyFamilyViewStyleValues);
export const familyViewStyleSchema = legacyFamilyViewStyleSchema.transform(() => "generationTree" as const);
export type FamilyViewStyle = "generationTree";
export const defaultShowSingleFamilyTree = false;

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
  familyViewStyle: legacyFamilyViewStyleSchema
    .optional()
    .transform((value) => (value === undefined ? undefined : ("generationTree" as const))),
  showSingleFamilyTree: z.boolean().optional(),
  lastSelectedPersonId: z.string().nullable().optional(),
  primaryFamilyUnitByPersonId: z.record(z.string(), z.string()).optional(),
  dismissedSuggestions: z.array(z.string()).optional(),
  cooccurrence: cooccurrencePreferencesSchema.optional()
});

export type GraphFilterVisibility = z.infer<typeof graphFilterVisibilitySchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type GraphLayoutMode = z.infer<typeof graphLayoutModeSchema>;

export const graphLayoutPersonInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});
export const nodePositionSchema = z.tuple([z.number(), z.number(), z.number()]);
export const graphLayoutRequestSchema = z.object({
  people: z.array(graphLayoutPersonInputSchema),
  relationships: z.array(
    z.object({
      fromPersonId: z.string().min(1),
      toPersonId: z.string().min(1),
      type: relationshipTypeSchema
    })
  ),
  viewMode: graphLayoutModeSchema.default("family"),
  familyViewStyle: legacyFamilyViewStyleSchema
    .optional()
    .transform((value) => (value === undefined ? undefined : ("generationTree" as const))),
  selectedPersonId: z.string().nullable().optional(),
  primaryFamilyUnitByPersonId: z.record(z.string(), z.string()).optional()
});
export const graphLayoutResponseSchema = z.object({
  layoutRevision: z.string().min(1),
  algorithmVersion: z.string().min(1),
  positionsByPersonId: z.record(z.string(), nodePositionSchema)
});

export type GraphLayoutRequest = z.infer<typeof graphLayoutRequestSchema>;
export type GraphLayoutResponse = z.infer<typeof graphLayoutResponseSchema>;
export type GraphLayoutPersonInput = z.infer<typeof graphLayoutPersonInputSchema>;
export type NodePosition = z.infer<typeof nodePositionSchema>;

const hashString = (input: string) => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/** Revision for layout cache / server positions. Only parent/child/spouse edges affect the relationship hash (same as web layout topology). */
export const buildGraphLayoutRevision = (request: GraphLayoutRequest) => {
  const peopleSignature = [...request.people]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((person) => `${person.id}:${person.name}`)
    .join(",");
  const topologyRelationships = filterGraphLayoutTopologyRelationships(request.relationships);
  const relationshipSignature = [...topologyRelationships]
    .sort((left, right) => {
      const leftKey = `${left.fromPersonId}|${left.type}|${left.toPersonId}`;
      const rightKey = `${right.fromPersonId}|${right.type}|${right.toPersonId}`;
      return leftKey.localeCompare(rightKey);
    })
    .map((relationship) => `${relationship.fromPersonId}|${relationship.type}|${relationship.toPersonId}`)
    .join(",");
  const primaryFamilySignature = request.primaryFamilyUnitByPersonId
    ? Object.entries(request.primaryFamilyUnitByPersonId)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([personId, unitKey]) => `${personId}:${unitKey}`)
        .join(",")
    : "";
  return [
    `mode=${request.viewMode}`,
    `style=${request.familyViewStyle ?? "generationTree"}`,
    `selected=${request.selectedPersonId ?? ""}`,
    `people=${hashString(peopleSignature)}`,
    `relationships=${hashString(relationshipSignature)}`,
    `primary=${hashString(primaryFamilySignature)}`
  ].join("|");
};
