/**
 * @packageDocumentation
 * Cross-package Treemich contracts: relationship/graph types, Zod schemas for preferences and layout,
 * Immich-facing DTOs, and re-exports for life events, person names, and research tasks.
 */

import { z } from "zod";
import type { FamilyChildPedigree } from "./families.js";
import type { AgeFilter, InterpreterIntent } from "./search/interpreter.js";

/** Canonical relationship kinds stored in Treemich person-id space. */
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

export const personExternalIdentityProviderValues = ["IMMICH", "GEDCOM", "OTHER"] as const;
export type PersonExternalIdentityProvider = (typeof personExternalIdentityProviderValues)[number];
export const personExternalIdentityProviderSchema = z.enum(personExternalIdentityProviderValues);

export const personThumbnailSourceValues = ["UPLOADED", "IMMICH", "GENERATED"] as const;
export type PersonThumbnailSource = (typeof personThumbnailSourceValues)[number];
export const personThumbnailSourceSchema = z.enum(personThumbnailSourceValues);

export const createPersonBodySchema = z.object({
  displayNameOverride: z.string().trim().min(1).max(200).nullable().optional(),
  givenName: z.string().trim().min(1).max(200).nullable().optional(),
  surname: z.string().trim().min(1).max(200).nullable().optional(),
  nicknames: z.string().trim().min(1).max(500).nullable().optional(),
  gender: genderSchema.optional(),
  birthDate: z.string().trim().min(1).nullable().optional(),
  deathDate: z.string().trim().min(1).nullable().optional()
});

export const patchPersonBodySchema = createPersonBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "At least one person field must be provided" });

export const createPersonExternalIdentityBodySchema = z.object({
  provider: personExternalIdentityProviderSchema,
  providerPersonId: z.string().trim().min(1),
  providerBaseUrl: z.string().trim().min(1).nullable().optional(),
  displayName: z.string().trim().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type CreatePersonBody = z.infer<typeof createPersonBodySchema>;
export type PatchPersonBody = z.infer<typeof patchPersonBodySchema>;
export type CreatePersonExternalIdentityBody = z.infer<typeof createPersonExternalIdentityBodySchema>;

export type PersonExternalIdentityRecord = {
  id: string;
  personId: string;
  provider: PersonExternalIdentityProvider;
  providerPersonId: string;
  providerBaseUrl: string | null;
  displayName: string | null;
  thumbnailImportedAt: string | null;
  lastSeenAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PersonThumbnailRecord = {
  id: string;
  personId: string;
  source: PersonThumbnailSource;
  storageUrl: string | null;
  mimeType: string | null;
  checksum: string | null;
  sourceExternalIdentityId: string | null;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Canonical Treemich person row. Immich ids are optional external identities. */
export type PersonRecord = {
  id: string;
  name: string;
  /** Treemich primary or formatted display; prefer over `name` for UI when set. */
  displayName?: string | null;
  birthDate?: string | null;
  thumbnailPath?: string | null;
  profile?: TreemichPersonProfile | null;
  externalIdentities?: PersonExternalIdentityRecord[];
  thumbnail?: PersonThumbnailRecord | null;
  hasRelationship?: boolean;
};

/** @deprecated Use PersonRecord. */
export type ImmichPerson = PersonRecord;

/** Treemich-owned fields layered on an Immich person (persisted in Treemich DB). */
export type TreemichPersonProfile = {
  id: string;
  /** @deprecated Immich ids now live in PersonExternalIdentity. */
  immichPersonId?: string | null;
  gender: GenderValue;
  givenName?: string | null;
  surname?: string | null;
  nicknames?: string | null;
  /** Optional interchange keys (e.g. GEDCOM xref). */
  externalIds?: Record<string, string> | null;
};

/** Directed relationship edge between two Treemich person ids. */
export type RelationshipRecord = {
  /** Present when returned from GET /relationships (Treemich relationship row id). */
  id?: string;
  fromPersonId: string;
  toPersonId: string;
  type: RelationshipType;
  marriageAnniversaryDate?: string | null;
  divorceDate?: string | null;
  /** When set, this parent/child edge was derived from a family union (Phase 4). */
  familyId?: string | null;
  /** For derived `PARENT_OF` edges: pedigree of the child in that family (for graph styling / NL). */
  childEdgePedigree?: FamilyChildPedigree | null;
};

export * from "./families.js";
export * from "./lifeEvents.js";
export * from "./personNames.js";
export * from "./researchTasks.js";
export * from "./evidence.js";

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
  sourceProvider?: PersonExternalIdentityProvider | null;
  sourceImportedAt?: string | null;
  sourceMetadata?: Record<string, unknown>;
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

export type ImmichImportCandidate = {
  personId: string;
  name: string;
  score: number;
  reason: "externalIdentity" | "exactName" | "partialName";
};

export type ImmichImportPreviewRow = {
  immichPersonId: string;
  name: string;
  birthDate?: string | null;
  thumbnailPath?: string | null;
  linkedPersonId?: string | null;
  linkedPersonName?: string | null;
  candidates: ImmichImportCandidate[];
};

export type ImmichImportPreviewResponse = {
  linked: boolean;
  people: ImmichImportPreviewRow[];
  totals: {
    immichPeople: number;
    linkedPeople: number;
    unlinkedPeople: number;
  };
};

export const immichImportDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("skip"),
    immichPersonId: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("link"),
    immichPersonId: z.string().trim().min(1),
    personId: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("create"),
    immichPersonId: z.string().trim().min(1),
    givenName: z.string().trim().min(1).nullable().optional(),
    surname: z.string().trim().min(1).nullable().optional(),
    gender: genderSchema.optional()
  })
]);

export const immichPeopleImportBodySchema = z.object({
  decisions: z.array(immichImportDecisionSchema).min(1),
  importThumbnails: z.boolean().optional()
});

export const immichThumbnailImportBodySchema = z.object({
  personIds: z.array(z.string().trim().min(1)).optional()
});

export type ImmichImportDecision = z.infer<typeof immichImportDecisionSchema>;
export type ImmichPeopleImportBody = z.infer<typeof immichPeopleImportBodySchema>;
export type ImmichThumbnailImportBody = z.infer<typeof immichThumbnailImportBodySchema>;

export type ImmichImportApplyResult = {
  immichPersonId: string;
  action: ImmichImportDecision["action"];
  personId?: string;
  status: "created" | "linked" | "skipped" | "alreadyLinked" | "error";
  message?: string;
};

export type ImmichPeopleImportResponse = {
  results: ImmichImportApplyResult[];
  summary: {
    created: number;
    linked: number;
    skipped: number;
    alreadyLinked: number;
    errors: number;
    thumbnailsImported: number;
  };
};

export type ImmichThumbnailImportResponse = {
  results: Array<{
    personId: string;
    immichPersonId: string;
    status: "imported" | "skipped" | "error";
    thumbnail?: PersonThumbnailRecord;
    message?: string;
  }>;
  summary: {
    imported: number;
    skipped: number;
    errors: number;
  };
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

/** Logged-in Treemich user. `immichUserId` is only present for Immich-linked accounts. */
export type AuthUser = {
  id: string;
  immichUserId?: string;
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
