/**
 * @packageDocumentation
 * Cross-package Treemich contracts: relationship/graph types, Zod schemas for preferences and layout,
 * Immich-facing DTOs, and re-exports for life events, person names, and research tasks.
 */

import { z } from "zod";
import type { AgeFilter, InterpreterIntent } from "./search/interpreter.js";

/** Canonical relationship kinds stored in Treemich (Immich person id endpoints). */
export const relationshipTypes = [
  "PARENT_OF",
  "CHILD_OF",
  "SPOUSE_OF",
  "SIBLING_OF",
  "FRIEND_OF",
  "PET_OF"
] as const;
export type RelationshipType = (typeof relationshipTypes)[number];

/**
 * Maps `PARENT_OF` ↔ `CHILD_OF` for undirected layout; other kinds pass through unchanged
 * (including self-inverse types such as `SPOUSE_OF`).
 */
export const inverseRelationshipType = (type: RelationshipType): RelationshipType => {
  if (type === "PARENT_OF") {
    return "CHILD_OF";
  }
  if (type === "CHILD_OF") {
    return "PARENT_OF";
  }
  return type;
};

/** Relationship kinds considered when computing family graph layout (parent/child/spouse topology). */
export const graphLayoutTopologyRelationshipTypes = ["PARENT_OF", "CHILD_OF", "SPOUSE_OF"] as const;

const graphLayoutTopologyTypeSet = new Set<RelationshipType>(graphLayoutTopologyRelationshipTypes);

/**
 * Keeps only edges used by the graph layout engine (parent, child, spouse); drops siblings, friends, pets, etc.
 */
export const filterGraphLayoutTopologyRelationships = <R extends { type: RelationshipType }>(
  relationships: readonly R[]
): R[] => relationships.filter((relationship) => graphLayoutTopologyTypeSet.has(relationship.type));

/** Stored gender enum for Treemich profiles (Immich-backed). */
export const genderValues = ["MALE", "FEMALE", "OTHER", "UNKNOWN"] as const;
export type GenderValue = (typeof genderValues)[number];

export const genderSchema = z.enum(genderValues);
export const relationshipTypeSchema = z.enum(relationshipTypes);
/** Layout request mode: family tree vs photo-centric (co-occurrence) graph. */
export const graphLayoutModeValues = ["family", "photo"] as const;
export const graphLayoutModeSchema = z.enum(graphLayoutModeValues);

/** Minimal Immich person row as Treemich uses it in lists and search (ids are Immich person ids). */
export type ImmichPerson = {
  id: string;
  name: string;
  /** Treemich primary or formatted display; prefer over `name` for UI when set. */
  displayName?: string | null;
  birthDate?: string | null;
  thumbnailPath?: string | null;
};

/** Treemich-owned fields layered on an Immich person (persisted in Treemich DB). */
export type TreemichPersonProfile = {
  immichPersonId: string;
  gender: GenderValue;
  givenName?: string | null;
  surname?: string | null;
  nicknames?: string | null;
  /** Optional interchange keys (e.g. GEDCOM xref). */
  externalIds?: Record<string, string> | null;
};

/** Directed relationship edge between two Immich person ids. */
export type RelationshipRecord = {
  /** Present when returned from GET /relationships (Treemich relationship row id). */
  id?: string;
  fromPersonId: string;
  toPersonId: string;
  type: RelationshipType;
  marriageAnniversaryDate?: string | null;
  divorceDate?: string | null;
};

export * from "./lifeEvents.js";
export * from "./personNames.js";
export * from "./researchTasks.js";

/** Weighted edge between two people derived from shared photo appearances. */
export type PhotoCooccurrenceEdge = {
  personAId: string;
  personBId: string;
  sharedPhotos: number;
  score: number;
};

/** Cluster of people who often appear together in photos (co-occurrence job output). */
export type PhotoCluster = {
  id: string;
  personIds: string[];
  size: number;
};

/** Snapshot payload for co-occurrence clusters and edges. */
export type PhotoCooccurrenceResponse = {
  clusters: PhotoCluster[];
  edges: PhotoCooccurrenceEdge[];
  computedAt: string;
  sourcePhotoCount: number;
};

/** Background co-occurrence computation job lifecycle. */
export const cooccurrenceJobStatusValues = ["PENDING", "RUNNING", "COMPLETED", "FAILED"] as const;
export const cooccurrenceJobStatusSchema = z.enum(cooccurrenceJobStatusValues);
export type CooccurrenceJobStatus = (typeof cooccurrenceJobStatusValues)[number];

/** Persisted co-occurrence edge row (paginated list API). */
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

/** Paginated edges listing for co-occurrence explorer. */
export type CooccurrenceEdgesResponse = {
  edges: CooccurrenceEdgeRecord[];
  nextCursor: string | null;
};

/** User-facing schedule metadata for automatic co-occurrence refresh. */
export type CooccurrenceScheduleInfo = {
  refreshEnabled: boolean;
  refreshIntervalDays: number;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
};

/** Current job row plus schedule info for co-occurrence UI. */
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

/** Logged-in Treemich user (linked Immich account). */
export type AuthUser = {
  id: string;
  immichUserId: string;
  email: string;
  name: string;
};

/** Whether the Treemich account is linked to Immich and basic link metadata. */
export type LinkStatus = {
  linked: boolean;
  immichBaseUrl?: string;
  immichEmail?: string;
  immichName?: string;
};

/** `/auth/me` and login payloads: session plus optional link info. */
export type AuthState = {
  authenticated: boolean;
  user?: AuthUser;
  linkStatus?: LinkStatus;
};

/** Natural-language people search: parsed intent, source candidates, and ranked matches. */
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

/** Which relationship categories are visible in the graph UI. */
export const graphFilterVisibilitySchema = z.object({
  parentChild: z.boolean(),
  spouse: z.boolean(),
  sibling: z.boolean(),
  friends: z.boolean(),
  pets: z.boolean()
});

/** Preset family-tree presentation modes in the web app. */
export const familyViewStyleValues = [
  "generationTree",
  "centeredRelationshipMap",
  "hybridTreeList",
  "cleaned3D"
] as const;
export const familyViewStyleSchema = z.enum(familyViewStyleValues);
/** How edges are routed in 2D overlays (when applicable). */
export const graphLineRoutingStyleValues = ["orthogonal", "direct"] as const;
export const graphLineRoutingStyleSchema = z.enum(graphLineRoutingStyleValues);
export type GraphLineRoutingStyle = z.infer<typeof graphLineRoutingStyleSchema>;
/** Default edge routing when preferences omit the field. */
export const defaultGraphLineRoutingStyle: GraphLineRoutingStyle = "orthogonal";
/** Default: do not force single-family-tree mode. */
export const defaultShowSingleFamilyTree = false;

/** User-controlled co-occurrence refresh behavior. */
export const cooccurrencePreferencesSchema = z.object({
  refreshEnabled: z.boolean(),
  refreshIntervalDays: z.number().int().min(1).max(90)
});
export type CooccurrencePreferences = z.infer<typeof cooccurrencePreferencesSchema>;

/** Default co-occurrence refresh: weekly-ish refresh on. */
export const defaultCooccurrencePreferences: CooccurrencePreferences = {
  refreshEnabled: true,
  refreshIntervalDays: 7
};

/** Persisted Treemich UI preferences (graph, layout, dismissed hints, search). */
export const userPreferencesSchema = z.object({
  graphFilterVisibility: graphFilterVisibilitySchema.optional(),
  familyViewStyle: familyViewStyleSchema.optional(),
  graphLineRoutingStyle: graphLineRoutingStyleSchema.optional(),
  showSingleFamilyTree: z.boolean().optional(),
  lastSelectedPersonId: z.string().nullable().optional(),
  primaryFamilyUnitByPersonId: z.record(z.string(), z.string()).optional(),
  dismissedSuggestions: z.array(z.string()).optional(),
  cooccurrence: cooccurrencePreferencesSchema.optional(),
  /** When true, natural-language people search also matches stored alternate names. */
  searchIncludeAlternateNames: z.boolean().optional()
});

export type GraphFilterVisibility = z.infer<typeof graphFilterVisibilitySchema>;
export type FamilyViewStyle = z.infer<typeof familyViewStyleSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type GraphLayoutMode = z.infer<typeof graphLayoutModeSchema>;

/** One person node sent to the layout service (id + display label). */
export const graphLayoutPersonInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});
/** 3D position tuple `[x, y, z]` returned for each person id. */
export const nodePositionSchema = z.tuple([z.number(), z.number(), z.number()]);
/** Request body for server-side graph layout computation. */
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
  familyViewStyle: familyViewStyleSchema.optional(),
  selectedPersonId: z.string().nullable().optional(),
  primaryFamilyUnitByPersonId: z.record(z.string(), z.string()).optional()
});
/** Layout response: stable revision string plus positions keyed by Immich person id. */
export const graphLayoutResponseSchema = z.object({
  layoutRevision: z.string().min(1),
  algorithmVersion: z.string().min(1),
  positionsByPersonId: z.record(z.string(), nodePositionSchema)
});

export type GraphLayoutRequest = z.infer<typeof graphLayoutRequestSchema>;
export type GraphLayoutResponse = z.infer<typeof graphLayoutResponseSchema>;
export type GraphLayoutPersonInput = z.infer<typeof graphLayoutPersonInputSchema>;
export type NodePosition = z.infer<typeof nodePositionSchema>;

/** FNV-1a 32-bit digest as lowercase hex (layout cache key helper). */
const hashString = (input: string) => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/**
 * Deterministic signature for a layout request so clients can skip re-fetching unchanged layouts.
 * Incorporates people names, topology-only relationships, view mode, style, selection, and primary units.
 */
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
    `style=${request.familyViewStyle ?? ""}`,
    `selected=${request.selectedPersonId ?? ""}`,
    `people=${hashString(peopleSignature)}`,
    `relationships=${hashString(relationshipSignature)}`,
    `primary=${hashString(primaryFamilySignature)}`
  ].join("|");
};
