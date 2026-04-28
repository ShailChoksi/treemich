/**
 * @packageDocumentation
 * Browser Treemich HTTP client: cookie session auth, people and relationships, life events, map, research tasks.
 * Base URL from `import.meta.env.VITE_TREEMICH_API_URL` or `"/api"`; read-heavy calls use retry on 5xx/network errors.
 */

import type {
  AuthState,
  AuthUser,
  CreateFamilyBody,
  CreateFamilyLifeEventBody,
  CreateLifeEventBody,
  CreateMediaObjectBody,
  CreatePersonNameBody,
  CreatePersonBody,
  CreatePersonExternalIdentityBody,
  CreateRepositoryBody,
  CreateResearchTaskBody,
  CreateSourceBody,
  FamilyRecord,
  GraphLayoutRequest,
  GraphLayoutResponse,
  GenderValue as Gender,
  ImmichImportDecision,
  ImmichImportPreviewResponse,
  ImmichPeopleImportResponse,
  ImmichThumbnailImportResponse,
  LifeEventListResponse,
  LifeEventRecord,
  LinkStatus,
  MediaObjectRecord,
  MergeSourcesBody,
  PatchFamilyBody,
  PatchLifeEventBody,
  PatchPersonNameBody,
  PatchResearchTaskBody,
  PersonNameTypeValue,
  PersonExternalIdentityRecord,
  PersonThumbnailRecord,
  PersonRecord,
  PhotoCluster,
  PhotoCooccurrenceEdge,
  RelationshipRecord,
  RelationshipType,
  RepositoryRecord,
  SearchRelationshipsResponse,
  ResearchTaskRecord,
  SourceRecord,
  TreemichPersonProfile,
  UserPreferences
} from "@treemich/shared";

/** Re-exported `@treemich/shared` types for modules that depend only on the web API layer. */
export type {
  AuthState,
  AuthUser,
  CreateFamilyBody,
  CreateFamilyLifeEventBody,
  CreateLifeEventBody,
  CreateMediaObjectBody,
  CreatePersonBody,
  CreatePersonExternalIdentityBody,
  CreatePersonNameBody,
  CreateRepositoryBody,
  CreateResearchTaskBody,
  CreateSourceBody,
  FamilyRecord,
  GraphLayoutRequest,
  GraphLayoutResponse,
  Gender,
  ImmichImportDecision,
  ImmichImportPreviewResponse,
  ImmichPeopleImportResponse,
  ImmichThumbnailImportResponse,
  LinkStatus,
  LifeEventRecord,
  MediaObjectRecord,
  MergeSourcesBody,
  PatchFamilyBody,
  PatchLifeEventBody,
  PatchPersonNameBody,
  PatchResearchTaskBody,
  PersonNameTypeValue,
  PersonExternalIdentityRecord,
  PersonThumbnailRecord,
  PersonRecord,
  PhotoCluster,
  PhotoCooccurrenceEdge,
  RelationshipRecord,
  RelationshipType,
  RepositoryRecord,
  ResearchTaskRecord,
  SearchRelationshipsResponse,
  SourceRecord,
  TreemichPersonProfile,
  UserPreferences
};

const treemichApi = import.meta.env.VITE_TREEMICH_API_URL ?? "/api";
const startupRetryDelayMs = 800;
const startupRetryAttempts = 5;

type RequestOptions = {
  signal?: AbortSignal;
};

/** Non-OK API response mapped to an `Error` with HTTP status for UI handling. */
export class ApiHttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.statusCode = statusCode;
  }
}

/**
 * Canonical Treemich person enriched with the `hasRelationship` UI flag from `GET /people`.
 * This is the same shape as `PersonRecord` from `@treemich/shared`.
 */
export type Person = PersonRecord;

/** Optional spouse timeline fields when creating/updating `SPOUSE_OF` edges. */
export type SpouseRelationshipDates = {
  marriageAnniversaryDate?: string | null;
  divorceDate?: string | null;
};

const sleep = (delayMs: number) => new Promise((resolve) => window.setTimeout(resolve, delayMs));

const shouldRetryResponse = (response: Response) => response.status >= 500;

const shouldRetryError = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof Error && /fetch|network|failed to fetch|load failed/i.test(error.message));

const withSession = (init?: RequestInit): RequestInit => ({
  credentials: "include",
  ...(init ?? {})
});

const fetchWithRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { retries?: number; baseDelayMs?: number }
) => {
  const retries = options?.retries ?? startupRetryAttempts;
  const baseDelayMs = options?.baseDelayMs ?? startupRetryDelayMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, withSession(init));
      if (!shouldRetryResponse(response) || attempt === retries) {
        return response;
      }
      await sleep(baseDelayMs * (attempt + 1));
      continue;
    } catch (error: unknown) {
      lastError = error;
      if (!shouldRetryError(error) || attempt === retries) {
        throw error;
      }
      await sleep(baseDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
};

type ZodIssueLike = { path?: (string | number)[]; message?: string };

const formatZodIssueSummary = (issues: ZodIssueLike[]) => {
  if (issues.length === 0) {
    return "";
  }
  const [first, ...rest] = issues;
  const path = first && first.path && first.path.length > 0 ? first.path.join(".") : "request";
  const detail = first?.message ? `${path}: ${first.message}` : path;
  return rest.length > 0 ? `${detail} (+${String(rest.length)} more)` : detail;
};

const getErrorMessage = async (response: Response, fallbackMessage: string) => {
  try {
    const json = (await response.json()) as {
      statusCode?: number;
      error?: string;
      message?: string;
      issues?: ZodIssueLike[];
    };
    const base = json.error ?? json.message ?? fallbackMessage;
    if (Array.isArray(json.issues) && json.issues.length > 0) {
      const detail = formatZodIssueSummary(json.issues);
      return {
        message: detail ? `${base} — ${detail}` : base,
        statusCode: typeof json.statusCode === "number" ? json.statusCode : response.status
      };
    }
    return {
      message: base,
      statusCode: typeof json.statusCode === "number" ? json.statusCode : response.status
    };
  } catch {
    return {
      message: fallbackMessage,
      statusCode: response.status
    };
  }
};

const ensureOk = async (response: Response, fallbackMessage: string) => {
  if (response.ok) {
    return response;
  }

  const { message, statusCode } = await getErrorMessage(response, fallbackMessage);
  throw new ApiHttpError(statusCode, message);
};

export type LoginProvider = "treemich" | "immich";

/** `POST /auth/login` — establishes session cookie. */
export const login = async (
  email: string,
  password: string,
  provider: LoginProvider = "treemich"
): Promise<AuthState> => {
  const response = await fetch(
    `${treemichApi}/auth/login`,
    withSession({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password, provider })
    })
  );
  await ensureOk(response, "Login failed");
  return (await response.json()) as AuthState;
};

/** `POST /auth/immich/link` — validate and store optional Immich provider credentials. */
export const linkImmichAccount = async (email: string, password: string): Promise<LinkStatus> => {
  const response = await fetch(
    `${treemichApi}/auth/immich/link`,
    withSession({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    })
  );
  await ensureOk(response, "Failed to link Immich account");
  return (await response.json()) as LinkStatus;
};

/** `DELETE /auth/immich/link` — remove stored Immich provider credentials. */
export const unlinkImmichAccount = async (): Promise<LinkStatus> => {
  const response = await fetch(
    `${treemichApi}/auth/immich/link`,
    withSession({
      method: "DELETE"
    })
  );
  await ensureOk(response, "Failed to unlink Immich account");
  return (await response.json()) as LinkStatus;
};

/** `POST /auth/logout` — clears session cookie. */
export const logout = async () => {
  const response = await fetch(
    `${treemichApi}/auth/logout`,
    withSession({
      method: "POST"
    })
  );
  await ensureOk(response, "Logout failed");
  return response.json() as Promise<{ success: boolean }>;
};

/** `GET /auth/me` — current session and link status (with startup retries). */
export const getCurrentUser = async (): Promise<AuthState> => {
  const response = await fetchWithRetry(`${treemichApi}/auth/me`, {
    cache: "no-store"
  });
  await ensureOk(response, "Failed to load auth session");
  return (await response.json()) as AuthState;
};

/** `GET /auth/link-status` — Immich link metadata. */
export const getLinkStatus = async (): Promise<LinkStatus> => {
  const response = await fetchWithRetry(`${treemichApi}/auth/link-status`, {
    cache: "no-store"
  });
  await ensureOk(response, "Failed to load linked Immich account");
  return (await response.json()) as LinkStatus;
};

/** `GET /people` — returns all Treemich-owned people for the authenticated user, with optional search. */
export const getPeople = async (query?: string): Promise<Person[]> => {
  const url = new URL(`${treemichApi}/people`, window.location.href);
  if (query) url.searchParams.set("q", query);
  const response = await fetchWithRetry(url.toString(), { cache: "no-store" });
  await ensureOk(response, `Failed to load people (${response.status})`);
  const json = (await response.json()) as { people?: Person[] };
  return json.people ?? [];
};

/** `POST /people` — creates a new Treemich person without requiring an Immich account. */
export const createPerson = async (body: CreatePersonBody): Promise<Person> => {
  const response = await fetch(
    `${treemichApi}/people`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to create person");
  return (await response.json()) as Person;
};

/** `DELETE /people/:id` — deletes a Treemich person and cascaded profile data. */
export const deletePerson = async (personId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/people/${personId}`,
    withSession({
      method: "DELETE"
    })
  );
  await ensureOk(response, "Failed to delete person");
};

/** `PATCH /people/:id` — Treemich profile fields (gender, names, etc.). */
export const updatePersonProfile = async (
  personId: string,
  profile: {
    gender?: Gender;
    birthDate?: string | null;
    givenName?: string | null;
    surname?: string | null;
    nicknames?: string | null;
    deathDate?: string | null;
    birthCity?: string | null;
    birthCountry?: string | null;
  }
) => {
  const response = await fetch(
    `${treemichApi}/people/${personId}`,
    withSession({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(profile)
    })
  );
  await ensureOk(response, "Failed to update profile");
  return (await response.json()) as TreemichPersonProfile;
};

/** `GET /people/:id/external-identities` — provider links for this Treemich person. */
export const getPersonExternalIdentities = async (
  personId: string
): Promise<PersonExternalIdentityRecord[]> => {
  const response = await fetchWithRetry(
    `${treemichApi}/people/${encodeURIComponent(personId)}/external-identities`,
    { cache: "no-store" }
  );
  await ensureOk(response, "Failed to load external identities");
  const body = (await response.json()) as { externalIdentities?: PersonExternalIdentityRecord[] };
  return body.externalIdentities ?? [];
};

/** `POST /people/:id/external-identities` — link an external provider identity. */
export const createPersonExternalIdentity = async (
  personId: string,
  body: CreatePersonExternalIdentityBody
): Promise<PersonExternalIdentityRecord> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/external-identities`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to link external identity");
  return (await response.json()) as PersonExternalIdentityRecord;
};

/** `DELETE /people/:id/external-identities/:identityId` — unlink an external provider identity. */
export const deletePersonExternalIdentity = async (personId: string, identityId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/external-identities/${encodeURIComponent(identityId)}`,
    withSession({ method: "DELETE" })
  );
  await ensureOk(response, "Failed to unlink external identity");
};

/** `POST /people/:id/thumbnail/upload` — store a Treemich-owned thumbnail image. */
export const uploadPersonThumbnail = async (personId: string, file: File): Promise<PersonThumbnailRecord> => {
  const body = new FormData();
  body.set("file", file);
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/thumbnail/upload`,
    withSession({
      method: "POST",
      body
    })
  );
  await ensureOk(response, "Failed to upload thumbnail");
  return (await response.json()) as PersonThumbnailRecord;
};

/** `POST /people/:id/thumbnail/import/immich` — refresh thumbnail bytes from the linked Immich identity. */
export const importPersonImmichThumbnail = async (personId: string): Promise<PersonThumbnailRecord> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/thumbnail/import/immich`,
    withSession({ method: "POST" })
  );
  await ensureOk(response, "Failed to import Immich thumbnail");
  return (await response.json()) as PersonThumbnailRecord;
};

/** `POST /people/:fromPersonId/relationships` — add edge; optional spouse dates for `SPOUSE_OF`. */
export const createRelationship = async (
  fromPersonId: string,
  toPersonId: string,
  relationshipType: RelationshipType,
  spouseDates?: SpouseRelationshipDates
) => {
  const response = await fetch(
    `${treemichApi}/people/${fromPersonId}/relationships`,
    withSession({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        toPersonId,
        relationshipType,
        ...(spouseDates ?? {})
      })
    })
  );
  await ensureOk(response, "Failed to create relationship");
  return response.json();
};

/** `PATCH /people/:fromPersonId/relationships` — update marriage/divorce dates only. */
export const updateSpouseRelationshipDates = async (
  fromPersonId: string,
  toPersonId: string,
  spouseDates: SpouseRelationshipDates
) => {
  const response = await fetch(
    `${treemichApi}/people/${fromPersonId}/relationships`,
    withSession({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        toPersonId,
        ...spouseDates
      })
    })
  );
  await ensureOk(response, "Failed to update spouse dates");
  return response.json() as Promise<{ updatedCount: number }>;
};

/** `DELETE /people/:fromPersonId/relationships` — remove edge (optional type filter). */
export const deleteRelationship = async (
  fromPersonId: string,
  toPersonId: string,
  relationshipType?: RelationshipType
) => {
  const query = new URLSearchParams({
    toPersonId
  });
  if (relationshipType) {
    query.set("type", relationshipType);
  }

  const response = await fetch(
    `${treemichApi}/people/${fromPersonId}/relationships?${query.toString()}`,
    withSession({
      method: "DELETE",
      headers: {}
    })
  );
  await ensureOk(response, "Failed to delete relationship");
  return response.json();
};

/** `GET /search?q=` — natural-language relationship search. */
export const searchRelationships = async (query: string): Promise<SearchRelationshipsResponse> => {
  const response = await fetchWithRetry(`${treemichApi}/search?q=${encodeURIComponent(query)}`);
  await ensureOk(response, "Search request failed");
  return (await response.json()) as SearchRelationshipsResponse;
};

/** Absolute URL for Treemich-proxied person thumbnail image. */
export const personThumbnailUrl = (personId: string, revision?: string) => {
  const baseUrl = `${treemichApi}/people/${encodeURIComponent(personId)}/thumbnail`;
  return revision ? `${baseUrl}?revision=${encodeURIComponent(revision)}` : baseUrl;
};

export const getImmichImportPreview = async (): Promise<ImmichImportPreviewResponse> => {
  const response = await fetchWithRetry(`${treemichApi}/providers/immich/people/preview`, {
    cache: "no-store"
  });
  await ensureOk(response, "Failed to load Immich import preview");
  return (await response.json()) as ImmichImportPreviewResponse;
};

export const importImmichPeople = async (
  decisions: ImmichImportDecision[],
  options?: { importThumbnails?: boolean }
): Promise<ImmichPeopleImportResponse> => {
  const response = await fetch(
    `${treemichApi}/providers/immich/people/import`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions, importThumbnails: options?.importThumbnails })
    })
  );
  await ensureOk(response, "Failed to import Immich people");
  return (await response.json()) as ImmichPeopleImportResponse;
};

export const importImmichThumbnails = async (
  personIds?: string[]
): Promise<ImmichThumbnailImportResponse> => {
  const response = await fetch(
    `${treemichApi}/providers/immich/thumbnails/import`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personIds })
    })
  );
  await ensureOk(response, "Failed to import Immich thumbnails");
  return (await response.json()) as ImmichThumbnailImportResponse;
};

export const importImmichCooccurrence = async (): Promise<{ jobId: string; status: string }> => {
  const response = await fetch(
    `${treemichApi}/providers/immich/cooccurrence/import`,
    withSession({ method: "POST" })
  );
  await ensureOk(response, "Failed to start Immich co-occurrence import");
  return (await response.json()) as { jobId: string; status: string };
};

/** Deep link to Immich person page when base URL is known (strips trailing `/api`). */
export const immichPersonUrl = (personId: string, immichBaseUrl?: string | null) => {
  if (!immichBaseUrl) {
    return null;
  }

  const normalizedBase = immichBaseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBase) {
    return null;
  }

  const appBase = normalizedBase.endsWith("/api") ? normalizedBase.slice(0, -4) : normalizedBase;
  if (!appBase) {
    return null;
  }

  return `${appBase}/people/${encodeURIComponent(personId)}`;
};

/** `GET /user/preferences` — graph and UI preferences. */
export const getUserPreferences = async (): Promise<UserPreferences> => {
  const response = await fetchWithRetry(`${treemichApi}/user/preferences`, {
    cache: "no-store"
  });
  await ensureOk(response, "Failed to load preferences");
  return (await response.json()) as UserPreferences;
};

/** `PATCH /user/preferences` — partial preference update. */
export const updateUserPreferences = async (prefs: Partial<UserPreferences>): Promise<UserPreferences> => {
  const response = await fetch(
    `${treemichApi}/user/preferences`,
    withSession({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs)
    })
  );
  await ensureOk(response, "Failed to save preferences");
  return (await response.json()) as UserPreferences;
};

/** Paginated `GET /relationships` — loads all pages into one array. */
export const getRelationships = async (): Promise<RelationshipRecord[]> => {
  const all: RelationshipRecord[] = [];
  let cursor: string | undefined;

  while (true) {
    const query = new URLSearchParams({
      t: String(Date.now()),
      limit: "1000"
    });
    if (cursor) {
      query.set("cursor", cursor);
    }

    const response = await fetchWithRetry(`${treemichApi}/relationships?${query.toString()}`, {
      cache: "no-store"
    });
    await ensureOk(response, `Failed to load relationships (${response.status})`);

    const json = (await response.json()) as {
      relationships?: RelationshipRecord[];
      nextCursor?: string | null;
    };
    all.push(...(json.relationships ?? []));
    if (!json.nextCursor) {
      break;
    }
    cursor = json.nextCursor;
  }

  return all;
};

/** `POST /graph/layout` — server-computed 3D positions. */
export const computeGraphLayout = async (payload: GraphLayoutRequest): Promise<GraphLayoutResponse> => {
  const response = await fetchWithRetry(`${treemichApi}/graph/layout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  await ensureOk(response, `Failed to compute graph layout (${response.status})`);
  return (await response.json()) as GraphLayoutResponse;
};

const lifeEventsIncludeQuery = (includeCitations?: boolean) => (includeCitations ? "?include=citations" : "");

/** `GET /people/:id/life-events` — optional `?include=citations`. */
export const getPersonLifeEvents = async (
  personId: string,
  options?: { includeCitations?: boolean } & RequestOptions
): Promise<LifeEventRecord[]> => {
  const response = await fetchWithRetry(
    `${treemichApi}/people/${encodeURIComponent(personId)}/life-events${lifeEventsIncludeQuery(options?.includeCitations)}`,
    { cache: "no-store", signal: options?.signal }
  );
  await ensureOk(response, "Failed to load person life events");
  const json = (await response.json()) as LifeEventListResponse;
  return json.lifeEvents ?? [];
};

/** `POST /people/:id/life-events` — person-scoped event (not marriage/divorce). */
export const createPersonLifeEvent = async (
  personId: string,
  body: CreateLifeEventBody
): Promise<LifeEventRecord> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/life-events`,
    withSession({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to create person life event");
  return (await response.json()) as LifeEventRecord;
};

/** `PATCH /people/:id/life-events/:eventId`. */
export const updatePersonLifeEvent = async (
  personId: string,
  eventId: string,
  body: PatchLifeEventBody
): Promise<LifeEventRecord> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/life-events/${encodeURIComponent(eventId)}`,
    withSession({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to update person life event");
  return (await response.json()) as LifeEventRecord;
};

/** `DELETE /people/:id/life-events/:eventId`. */
export const deletePersonLifeEvent = async (personId: string, eventId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/life-events/${encodeURIComponent(eventId)}`,
    withSession({
      method: "DELETE"
    })
  );
  await ensureOk(response, "Failed to delete person life event");
};

/** Single validation issue from person-scoped life-event checks. */
export type PersonLifeEventValidationFinding = {
  code: string;
  severity: "error" | "warning";
  message: string;
  personId?: string;
  relationshipId?: string;
  relatedPersonId?: string;
};

/** `GET .../life-events/validation` response wrapper. */
export type PersonLifeEventValidationResponse = {
  findings: PersonLifeEventValidationFinding[];
};

/** Alternate name row from Treemich. */
export type PersonNameRecord = {
  id: string;
  type: PersonNameTypeValue;
  givenName: string | null;
  surname: string | null;
  prefix: string | null;
  suffix: string | null;
  isPrimary: boolean;
  notes: string | null;
  display: string;
  createdAt: string;
  updatedAt: string;
};

/** `GET /tree/validation` — whole-tree consistency findings. */
export type TreeValidationResponse = {
  findings: PersonLifeEventValidationFinding[];
  engineDisabled: boolean;
  persist: false;
};

/** `GET /tree/validation`. */
export const getTreeValidation = async (): Promise<TreeValidationResponse> => {
  const response = await fetchWithRetry(`${treemichApi}/tree/validation`, { cache: "no-store" });
  await ensureOk(response, "Failed to load tree validation");
  return (await response.json()) as TreeValidationResponse;
};

/** `GET /people/:id/names`. */
export const getPersonNames = async (personId: string): Promise<PersonNameRecord[]> => {
  const response = await fetchWithRetry(`${treemichApi}/people/${encodeURIComponent(personId)}/names`, {
    cache: "no-store"
  });
  await ensureOk(response, "Failed to load person names");
  const json = (await response.json()) as { names: PersonNameRecord[] };
  return json.names ?? [];
};

/** `POST /people/:id/names`. */
export const createPersonName = async (
  personId: string,
  body: CreatePersonNameBody
): Promise<PersonNameRecord> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/names`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to create person name");
  return (await response.json()) as PersonNameRecord;
};

/** `PATCH /people/:id/names/:nameId`. */
export const updatePersonName = async (
  personId: string,
  nameId: string,
  body: PatchPersonNameBody
): Promise<PersonNameRecord> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/names/${encodeURIComponent(nameId)}`,
    withSession({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to update person name");
  return (await response.json()) as PersonNameRecord;
};

/** `DELETE /people/:id/names/:nameId`. */
export const deletePersonName = async (personId: string, nameId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/names/${encodeURIComponent(nameId)}`,
    withSession({ method: "DELETE" })
  );
  await ensureOk(response, "Failed to delete person name");
};

/** `POST /people/:id/names/:nameId/set-primary`. */
export const setPrimaryPersonName = async (personId: string, nameId: string): Promise<PersonNameRecord> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/names/${encodeURIComponent(nameId)}/set-primary`,
    withSession({ method: "POST" })
  );
  await ensureOk(response, "Failed to set primary name");
  return (await response.json()) as PersonNameRecord;
};

/** `GET /people/:id/life-events/validation`. */
export const getPersonLifeEventValidation = async (
  personId: string
): Promise<PersonLifeEventValidationResponse> => {
  const response = await fetchWithRetry(
    `${treemichApi}/people/${encodeURIComponent(personId)}/life-events/validation`,
    { cache: "no-store" }
  );
  await ensureOk(response, "Failed to load person life event validation");
  return (await response.json()) as PersonLifeEventValidationResponse;
};

/** `GET /relationships/:id/life-events` — marriage/divorce etc. */
export const getRelationshipLifeEvents = async (
  relationshipId: string,
  options?: { includeCitations?: boolean } & RequestOptions
): Promise<LifeEventRecord[]> => {
  const response = await fetchWithRetry(
    `${treemichApi}/relationships/${encodeURIComponent(relationshipId)}/life-events${lifeEventsIncludeQuery(options?.includeCitations)}`,
    { cache: "no-store", signal: options?.signal }
  );
  await ensureOk(response, "Failed to load relationship life events");
  const json = (await response.json()) as LifeEventListResponse;
  return json.lifeEvents ?? [];
};

/** `POST /relationships/:id/life-events`. */
export const createRelationshipLifeEvent = async (
  relationshipId: string,
  body: CreateLifeEventBody
): Promise<LifeEventRecord> => {
  const response = await fetch(
    `${treemichApi}/relationships/${encodeURIComponent(relationshipId)}/life-events`,
    withSession({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to create relationship life event");
  return (await response.json()) as LifeEventRecord;
};

/** `PATCH /relationships/:id/life-events/:eventId`. */
export const updateRelationshipLifeEvent = async (
  relationshipId: string,
  eventId: string,
  body: PatchLifeEventBody
): Promise<LifeEventRecord> => {
  const response = await fetch(
    `${treemichApi}/relationships/${encodeURIComponent(relationshipId)}/life-events/${encodeURIComponent(eventId)}`,
    withSession({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to update relationship life event");
  return (await response.json()) as LifeEventRecord;
};

/** `DELETE /relationships/:id/life-events/:eventId`. */
export const deleteRelationshipLifeEvent = async (relationshipId: string, eventId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/relationships/${encodeURIComponent(relationshipId)}/life-events/${encodeURIComponent(eventId)}`,
    withSession({
      method: "DELETE"
    })
  );
  await ensureOk(response, "Failed to delete relationship life event");
};

/** Timeline row: life event plus monotonic `dateSortKey` for ordering. */
export type TimelineEventRecord = LifeEventRecord & {
  dateSortKey: number;
};

/** `GET /people/:id/timeline` body. */
export type PersonTimelineResponse = {
  timeline: TimelineEventRecord[];
};

/** `GET /people/:id/timeline` — merged chronology for sidebar. */
export const getPersonTimeline = async (
  personId: string,
  options?: RequestOptions
): Promise<PersonTimelineResponse> => {
  const response = await fetchWithRetry(`${treemichApi}/people/${encodeURIComponent(personId)}/timeline`, {
    cache: "no-store",
    signal: options?.signal
  });
  await ensureOk(response, "Failed to load person timeline");
  return (await response.json()) as PersonTimelineResponse;
};

/** One geocoded place aggregate for the map panel. */
export type PlacesMapPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  eventCount: number;
  personCount: number;
  lastEventYear: number | null;
  samplePersonIds: string[];
};

/** `GET /places/map` — feature flag plus place points. */
export type PlacesMapResponse = {
  mapUiEnabled: boolean;
  places: PlacesMapPoint[];
};

/** `GET /places/map` — optional `includeLiving=false` excludes likely-living people's points. */
export const getPlacesMap = async (
  options?: { includeLiving?: boolean } & RequestOptions
): Promise<PlacesMapResponse> => {
  const params = new URLSearchParams();
  if (options?.includeLiving === false) {
    params.set("includeLiving", "false");
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetchWithRetry(`${treemichApi}/places/map${suffix}`, {
    cache: "no-store",
    signal: options?.signal
  });
  await ensureOk(response, "Failed to load map places");
  return (await response.json()) as PlacesMapResponse;
};

/** `GET /people/:personId/families` — family units this person appears in. */
export const getFamiliesForPerson = async (
  personId: string,
  options?: RequestOptions
): Promise<FamilyRecord[]> => {
  const response = await fetchWithRetry(`${treemichApi}/people/${encodeURIComponent(personId)}/families`, {
    cache: "no-store",
    signal: options?.signal
  });
  await ensureOk(response, "Failed to load families");
  const body = (await response.json()) as { families: FamilyRecord[] };
  return body.families ?? [];
};

/** `POST /families` — create a family union; server derives parent/child graph edges. */
export const createFamily = async (body: CreateFamilyBody): Promise<FamilyRecord> => {
  const response = await fetch(`${treemichApi}/families`, {
    ...withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  });
  await ensureOk(response, "Failed to create family");
  return (await response.json()) as FamilyRecord;
};

/** `PATCH /families/:id` — notes, parents, or replace children list. */
export const patchFamily = async (familyId: string, body: PatchFamilyBody): Promise<FamilyRecord> => {
  const response = await fetch(
    `${treemichApi}/families/${encodeURIComponent(familyId)}`,
    withSession({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to update family");
  return (await response.json()) as FamilyRecord;
};

/** `DELETE /families/:id` — removes union and derived tagged parent/child edges. */
export const deleteFamily = async (familyId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/families/${encodeURIComponent(familyId)}`,
    withSession({ method: "DELETE" })
  );
  await ensureOk(response, "Failed to delete family");
};

/** `GET /families/:familyId/life-events`. */
export const getFamilyLifeEvents = async (
  familyId: string,
  options?: { includeCitations?: boolean } & RequestOptions
): Promise<LifeEventRecord[]> => {
  const response = await fetchWithRetry(
    `${treemichApi}/families/${encodeURIComponent(familyId)}/life-events${lifeEventsIncludeQuery(options?.includeCitations)}`,
    { cache: "no-store", signal: options?.signal }
  );
  await ensureOk(response, "Failed to load family life events");
  const json = (await response.json()) as LifeEventListResponse;
  return json.lifeEvents ?? [];
};

/** `POST /families/:familyId/life-events` — RESIDENCE, CENSUS, CUSTOM only. */
export const createFamilyLifeEvent = async (
  familyId: string,
  body: CreateFamilyLifeEventBody
): Promise<LifeEventRecord> => {
  const response = await fetch(
    `${treemichApi}/families/${encodeURIComponent(familyId)}/life-events`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to create family life event");
  return (await response.json()) as LifeEventRecord;
};

/** `PATCH /families/:familyId/life-events/:eventId`. */
export const updateFamilyLifeEvent = async (
  familyId: string,
  eventId: string,
  body: PatchLifeEventBody
): Promise<LifeEventRecord> => {
  const response = await fetch(
    `${treemichApi}/families/${encodeURIComponent(familyId)}/life-events/${encodeURIComponent(eventId)}`,
    withSession({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to update family life event");
  return (await response.json()) as LifeEventRecord;
};

/** `DELETE /families/:familyId/life-events/:eventId`. */
export const deleteFamilyLifeEvent = async (familyId: string, eventId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/families/${encodeURIComponent(familyId)}/life-events/${encodeURIComponent(eventId)}`,
    withSession({ method: "DELETE" })
  );
  await ensureOk(response, "Failed to delete family life event");
};

export const getResearchTasks = async (
  personId?: string,
  options?: RequestOptions
): Promise<ResearchTaskRecord[]> => {
  const query = personId ? `?personId=${encodeURIComponent(personId)}` : "";
  const response = await fetchWithRetry(`${treemichApi}/research/tasks${query}`, {
    cache: "no-store",
    signal: options?.signal
  });
  await ensureOk(response, "Failed to load research tasks");
  const body = (await response.json()) as { tasks: ResearchTaskRecord[] };
  return body.tasks ?? [];
};

/** `POST /research/tasks`. */
export const createResearchTask = async (body: CreateResearchTaskBody): Promise<ResearchTaskRecord> => {
  const response = await fetch(
    `${treemichApi}/research/tasks`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to create research task");
  return (await response.json()) as ResearchTaskRecord;
};

/** `PATCH /research/tasks/:id`. */
export const updateResearchTask = async (
  taskId: string,
  body: PatchResearchTaskBody
): Promise<ResearchTaskRecord> => {
  const response = await fetch(
    `${treemichApi}/research/tasks/${encodeURIComponent(taskId)}`,
    withSession({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to update research task");
  return (await response.json()) as ResearchTaskRecord;
};

/** `DELETE /research/tasks/:id`. */
export const deleteResearchTask = async (taskId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/research/tasks/${encodeURIComponent(taskId)}`,
    withSession({ method: "DELETE" })
  );
  await ensureOk(response, "Failed to delete research task");
};

/** `GET /evidence/repositories` — archives / libraries for grouping sources. */
export const listEvidenceRepositories = async (): Promise<RepositoryRecord[]> => {
  const response = await fetchWithRetry(`${treemichApi}/evidence/repositories`, { cache: "no-store" });
  await ensureOk(response, "Failed to load repositories");
  const body = (await response.json()) as { repositories: RepositoryRecord[] };
  return body.repositories ?? [];
};

/** `GET /evidence/sources` — shared bibliography entries (optional `q` filters title). */
export const listEvidenceSources = async (q?: string): Promise<SourceRecord[]> => {
  const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const response = await fetchWithRetry(`${treemichApi}/evidence/sources${query}`, { cache: "no-store" });
  await ensureOk(response, "Failed to load sources");
  const body = (await response.json()) as { sources: SourceRecord[] };
  return body.sources ?? [];
};

/** `POST /evidence/repositories`. */
export const createEvidenceRepository = async (body: CreateRepositoryBody): Promise<RepositoryRecord> => {
  const response = await fetch(
    `${treemichApi}/evidence/repositories`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to create repository");
  return (await response.json()) as RepositoryRecord;
};

/** `POST /evidence/sources`. */
export const createEvidenceSource = async (body: CreateSourceBody): Promise<SourceRecord> => {
  const response = await fetch(
    `${treemichApi}/evidence/sources`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to create source");
  return (await response.json()) as SourceRecord;
};

/** `POST /evidence/sources/merge` — reassigns citations then deletes the duplicate source. */
export const mergeEvidenceSources = async (body: MergeSourcesBody): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/evidence/sources/merge`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to merge sources");
};

/** `GET /evidence/media` — registered media objects (URLs, checksums, optional Immich link). */
export const listEvidenceMediaObjects = async (): Promise<MediaObjectRecord[]> => {
  const response = await fetchWithRetry(`${treemichApi}/evidence/media`, { cache: "no-store" });
  await ensureOk(response, "Failed to load media objects");
  const body = (await response.json()) as { mediaObjects: MediaObjectRecord[] };
  return body.mediaObjects ?? [];
};

/** `POST /evidence/media`. */
export const createEvidenceMediaObject = async (body: CreateMediaObjectBody): Promise<MediaObjectRecord> => {
  const response = await fetch(
    `${treemichApi}/evidence/media`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "Failed to create media object");
  return (await response.json()) as MediaObjectRecord;
};

/** `POST /import/gedcom/preview` — parse UTF-8 GEDCOM and list INDI/FAM for matching (Phase 5b). */
export type GedcomImportPreviewIndiRow = {
  xref: string;
  displayName: string | null;
  personHint: string | null;
  /** @deprecated Legacy provider hint retained for older GEDCOM preview responses; use personHint. */
  immichHint?: string | null;
};

export type GedcomImportPreviewResponse = {
  indis: GedcomImportPreviewIndiRow[];
  fams: { xref: string; husbXref: string | null; wifeXref: string | null; childXrefs: string[] }[];
  media: { xref: string; file: string | null; title: string | null; form: string | null }[];
  archiveMediaFiles: { path: string; byteSize: number; mimeType: string | null }[];
  unmatchedIndis: GedcomImportPreviewIndiRow[];
  unmatchedIndiPolicy?: "MATCH_ONLY" | "CREATE";
  famMatchError: string | null;
  lineLog: unknown[];
};

export type GedcomDryRunDiff = {
  creates: Record<string, number>;
  updates: Record<string, number>;
  reuses: Record<string, number>;
  skips: Record<string, number>;
  conflicts: Record<string, number>;
  warnings: number;
};

export type GedcomImportSummary = Record<string, unknown> & {
  dryRunDiff?: GedcomDryRunDiff;
};

export const postGedcomImportPreview = async (gedcomUtf8: string): Promise<GedcomImportPreviewResponse> => {
  const response = await fetch(
    `${treemichApi}/import/gedcom/preview`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gedcomUtf8 })
    })
  );
  await ensureOk(response, "GEDCOM preview failed");
  return (await response.json()) as GedcomImportPreviewResponse;
};

export const postGedcomImportArchivePreview = async (archive: File): Promise<GedcomImportPreviewResponse> => {
  const form = new FormData();
  form.append("archive", archive, archive.name);
  const response = await fetch(
    `${treemichApi}/import/gedcom/preview/archive`,
    withSession({
      method: "POST",
      body: form
    })
  );
  await ensureOk(response, "GEDCOM archive preview failed");
  return (await response.json()) as GedcomImportPreviewResponse;
};

export type GedcomImportJobCreateBody = {
  gedcomUtf8: string;
  fileName?: string;
  indiMatches: Record<string, string>;
  importOptions?: {
    dryRun?: boolean;
    skipAlreadyImportedIndis?: boolean;
    allowPartialMatches?: boolean;
    unmatchedIndiPolicy?: "MATCH_ONLY" | "CREATE";
  };
};

export const postGedcomImportJob = async (
  body: GedcomImportJobCreateBody
): Promise<{ id: string; status: string; createdAt: string }> => {
  const response = await fetch(
    `${treemichApi}/import/gedcom/jobs`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
  await ensureOk(response, "GEDCOM import job failed to start");
  return (await response.json()) as { id: string; status: string; createdAt: string };
};

export const postGedcomImportArchiveJob = async (body: {
  archive: File;
  indiMatches: Record<string, string>;
  importOptions?: {
    dryRun?: boolean;
    skipAlreadyImportedIndis?: boolean;
    allowPartialMatches?: boolean;
    unmatchedIndiPolicy?: "MATCH_ONLY" | "CREATE";
  };
}): Promise<{ id: string; status: string; createdAt: string }> => {
  const form = new FormData();
  form.append("archive", body.archive, body.archive.name);
  form.append("indiMatches", JSON.stringify(body.indiMatches));
  form.append("importOptions", JSON.stringify(body.importOptions ?? {}));
  const response = await fetch(
    `${treemichApi}/import/gedcom/jobs/archive`,
    withSession({
      method: "POST",
      body: form
    })
  );
  await ensureOk(response, "GEDCOM archive import job failed to start");
  return (await response.json()) as { id: string; status: string; createdAt: string };
};

export type GedcomImportJobStatusResponse = {
  id: string;
  status: string;
  fileName: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  summary: GedcomImportSummary | null;
  lineLog: unknown[];
};

export const getGedcomImportJob = async (jobId: string): Promise<GedcomImportJobStatusResponse> => {
  const response = await fetch(
    `${treemichApi}/import/gedcom/jobs/${encodeURIComponent(jobId)}`,
    withSession({ cache: "no-store" })
  );
  await ensureOk(response, "Failed to load GEDCOM import job");
  return (await response.json()) as GedcomImportJobStatusResponse;
};

/** `POST /export/gedcom/jobs` — queue async UTF-8 export (Phase 5a). */
export const postGedcomExportJob = async (opts?: {
  redactLiving?: boolean;
  includeTreemichCustomTags?: boolean;
}): Promise<{ id: string; status: string; createdAt: string }> => {
  const response = await fetch(
    `${treemichApi}/export/gedcom/jobs`,
    withSession({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts ?? {})
    })
  );
  await ensureOk(response, "GEDCOM export job failed to start");
  return (await response.json()) as { id: string; status: string; createdAt: string };
};

export type GedcomExportJobStatusResponse = {
  id: string;
  status: string;
  redactLiving: boolean;
  includeTreemichCustomTags: boolean;
  byteSize: number | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  resultPath: string | null;
  downloadUrl?: string | null;
  downloadTokenExpiresAt?: string | null;
};

export const getGedcomExportJob = async (jobId: string): Promise<GedcomExportJobStatusResponse> => {
  const response = await fetch(
    `${treemichApi}/export/gedcom/jobs/${encodeURIComponent(jobId)}`,
    withSession({ cache: "no-store" })
  );
  await ensureOk(response, "Failed to load GEDCOM export job");
  return (await response.json()) as GedcomExportJobStatusResponse;
};

/** Download completed async export. A signed URL can be used without the original browser session. */
export const downloadGedcomExportJobResult = async (
  jobId: string,
  downloadUrl?: string | null
): Promise<Blob> => {
  const response = await fetch(
    downloadUrl
      ? `${treemichApi}${downloadUrl}`
      : `${treemichApi}/export/gedcom/jobs/${encodeURIComponent(jobId)}/ged`,
    downloadUrl ? { cache: "no-store" } : withSession({ cache: "no-store" })
  );
  await ensureOk(response, "Failed to download GEDCOM export result");
  return response.blob();
};

/** Immediate `GET /export/gedcom` download as Blob (UTF-8 `.ged` or ZIP). */
export const fetchGedcomExportDownload = async (format: "ged" | "zip" = "ged"): Promise<Blob> => {
  const response = await fetch(
    `${treemichApi}/export/gedcom?format=${encodeURIComponent(format)}`,
    withSession({ cache: "no-store" })
  );
  await ensureOk(response, "GEDCOM export download failed");
  return response.blob();
};
