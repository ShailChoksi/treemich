import type {
  AuthState,
  AuthUser,
  CreateLifeEventBody,
  CreatePersonNameBody,
  CreateResearchTaskBody,
  GraphLayoutRequest,
  GraphLayoutResponse,
  GenderValue as Gender,
  ImmichPerson as SharedImmichPerson,
  LifeEventListResponse,
  LifeEventRecord,
  LinkStatus,
  PatchLifeEventBody,
  PatchPersonNameBody,
  PatchResearchTaskBody,
  PersonNameTypeValue,
  PhotoCluster,
  PhotoCooccurrenceEdge,
  RelationshipRecord,
  RelationshipType,
  SearchRelationshipsResponse,
  ResearchTaskRecord,
  TreemichPersonProfile,
  UserPreferences
} from "@treemich/shared";
export type {
  AuthState,
  AuthUser,
  CreateLifeEventBody,
  CreatePersonNameBody,
  CreateResearchTaskBody,
  GraphLayoutRequest,
  GraphLayoutResponse,
  Gender,
  LinkStatus,
  LifeEventRecord,
  PatchLifeEventBody,
  PatchPersonNameBody,
  PatchResearchTaskBody,
  PersonNameTypeValue,
  PhotoCluster,
  PhotoCooccurrenceEdge,
  RelationshipRecord,
  RelationshipType,
  ResearchTaskRecord,
  SearchRelationshipsResponse,
  TreemichPersonProfile,
  UserPreferences
};

const treemichApi = import.meta.env.VITE_TREEMICH_API_URL ?? "/api";
const startupRetryDelayMs = 800;
const startupRetryAttempts = 5;

export class ApiHttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.statusCode = statusCode;
  }
}

export type ImmichPerson = SharedImmichPerson & {
  id: string;
  name: string;
  profile?: TreemichPersonProfile | null;
  hasRelationship?: boolean;
};

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

const getErrorMessage = async (response: Response, fallbackMessage: string) => {
  try {
    const json = (await response.json()) as { statusCode?: number; error?: string; message?: string };
    return {
      message: json.error ?? json.message ?? fallbackMessage,
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

export const login = async (email: string, password: string): Promise<AuthState> => {
  const response = await fetch(
    `${treemichApi}/auth/login`,
    withSession({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    })
  );
  await ensureOk(response, "Login failed");
  return (await response.json()) as AuthState;
};

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

export const getCurrentUser = async (): Promise<AuthState> => {
  const response = await fetchWithRetry(`${treemichApi}/auth/me`, {
    cache: "no-store"
  });
  await ensureOk(response, "Failed to load auth session");
  return (await response.json()) as AuthState;
};

export const getLinkStatus = async (): Promise<LinkStatus> => {
  const response = await fetchWithRetry(`${treemichApi}/auth/link-status`, {
    cache: "no-store"
  });
  await ensureOk(response, "Failed to load linked Immich account");
  return (await response.json()) as LinkStatus;
};

export const getImmichPeople = async (): Promise<ImmichPerson[]> => {
  const response = await fetchWithRetry(`${treemichApi}/people`, {
    cache: "no-store"
  });
  await ensureOk(response, `Failed to load people (${response.status})`);
  const json = (await response.json()) as { people?: ImmichPerson[] };
  return json.people ?? [];
};

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

export const searchRelationships = async (query: string): Promise<SearchRelationshipsResponse> => {
  const response = await fetchWithRetry(`${treemichApi}/search?q=${encodeURIComponent(query)}`);
  await ensureOk(response, "Search request failed");
  return (await response.json()) as SearchRelationshipsResponse;
};

export const personThumbnailUrl = (personId: string) =>
  `${treemichApi}/people/${encodeURIComponent(personId)}/thumbnail`;

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

export const getUserPreferences = async (): Promise<UserPreferences> => {
  const response = await fetchWithRetry(`${treemichApi}/user/preferences`, {
    cache: "no-store"
  });
  await ensureOk(response, "Failed to load preferences");
  return (await response.json()) as UserPreferences;
};

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

export const getPersonLifeEvents = async (
  personId: string,
  options?: { includeCitations?: boolean }
): Promise<LifeEventRecord[]> => {
  const response = await fetchWithRetry(
    `${treemichApi}/people/${encodeURIComponent(personId)}/life-events${lifeEventsIncludeQuery(options?.includeCitations)}`,
    { cache: "no-store" }
  );
  await ensureOk(response, "Failed to load person life events");
  const json = (await response.json()) as LifeEventListResponse;
  return json.lifeEvents ?? [];
};

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

export const deletePersonLifeEvent = async (personId: string, eventId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/life-events/${encodeURIComponent(eventId)}`,
    withSession({
      method: "DELETE"
    })
  );
  await ensureOk(response, "Failed to delete person life event");
};

export type PersonLifeEventValidationFinding = {
  code: string;
  severity: "error" | "warning";
  message: string;
  immichPersonId?: string;
  relationshipId?: string;
  relatedImmichPersonId?: string;
};

export type PersonLifeEventValidationResponse = {
  findings: PersonLifeEventValidationFinding[];
};

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

export type TreeValidationResponse = {
  findings: PersonLifeEventValidationFinding[];
  engineDisabled: boolean;
  persist: false;
};

export const getTreeValidation = async (): Promise<TreeValidationResponse> => {
  const response = await fetchWithRetry(`${treemichApi}/tree/validation`, { cache: "no-store" });
  await ensureOk(response, "Failed to load tree validation");
  return (await response.json()) as TreeValidationResponse;
};

export const getPersonNames = async (personId: string): Promise<PersonNameRecord[]> => {
  const response = await fetchWithRetry(`${treemichApi}/people/${encodeURIComponent(personId)}/names`, {
    cache: "no-store"
  });
  await ensureOk(response, "Failed to load person names");
  const json = (await response.json()) as { names: PersonNameRecord[] };
  return json.names ?? [];
};

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

export const deletePersonName = async (personId: string, nameId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/names/${encodeURIComponent(nameId)}`,
    withSession({ method: "DELETE" })
  );
  await ensureOk(response, "Failed to delete person name");
};

export const setPrimaryPersonName = async (personId: string, nameId: string): Promise<PersonNameRecord> => {
  const response = await fetch(
    `${treemichApi}/people/${encodeURIComponent(personId)}/names/${encodeURIComponent(nameId)}/set-primary`,
    withSession({ method: "POST" })
  );
  await ensureOk(response, "Failed to set primary name");
  return (await response.json()) as PersonNameRecord;
};

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

export const getRelationshipLifeEvents = async (
  relationshipId: string,
  options?: { includeCitations?: boolean }
): Promise<LifeEventRecord[]> => {
  const response = await fetchWithRetry(
    `${treemichApi}/relationships/${encodeURIComponent(relationshipId)}/life-events${lifeEventsIncludeQuery(options?.includeCitations)}`,
    { cache: "no-store" }
  );
  await ensureOk(response, "Failed to load relationship life events");
  const json = (await response.json()) as LifeEventListResponse;
  return json.lifeEvents ?? [];
};

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

export const deleteRelationshipLifeEvent = async (relationshipId: string, eventId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/relationships/${encodeURIComponent(relationshipId)}/life-events/${encodeURIComponent(eventId)}`,
    withSession({
      method: "DELETE"
    })
  );
  await ensureOk(response, "Failed to delete relationship life event");
};

export type TimelineEventRecord = LifeEventRecord & {
  dateSortKey: number;
};

export type PersonTimelineResponse = {
  timeline: TimelineEventRecord[];
};

export const getPersonTimeline = async (personId: string): Promise<PersonTimelineResponse> => {
  const response = await fetchWithRetry(`${treemichApi}/people/${encodeURIComponent(personId)}/timeline`, {
    cache: "no-store"
  });
  await ensureOk(response, "Failed to load person timeline");
  return (await response.json()) as PersonTimelineResponse;
};

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

export type PlacesMapResponse = {
  mapUiEnabled: boolean;
  places: PlacesMapPoint[];
};

export const getPlacesMap = async (options?: { includeLiving?: boolean }): Promise<PlacesMapResponse> => {
  const params = new URLSearchParams();
  if (options?.includeLiving === false) {
    params.set("includeLiving", "false");
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetchWithRetry(`${treemichApi}/places/map${suffix}`, { cache: "no-store" });
  await ensureOk(response, "Failed to load map places");
  return (await response.json()) as PlacesMapResponse;
};

export const getResearchTasks = async (personId?: string): Promise<ResearchTaskRecord[]> => {
  const query = personId ? `?personId=${encodeURIComponent(personId)}` : "";
  const response = await fetchWithRetry(`${treemichApi}/research/tasks${query}`, { cache: "no-store" });
  await ensureOk(response, "Failed to load research tasks");
  const body = (await response.json()) as { tasks: ResearchTaskRecord[] };
  return body.tasks ?? [];
};

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

export const deleteResearchTask = async (taskId: string): Promise<void> => {
  const response = await fetch(
    `${treemichApi}/research/tasks/${encodeURIComponent(taskId)}`,
    withSession({ method: "DELETE" })
  );
  await ensureOk(response, "Failed to delete research task");
};
