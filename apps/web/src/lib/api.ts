import type {
  AuthState,
  AuthUser,
  GenderValue as Gender,
  ImmichPerson as SharedImmichPerson,
  LinkStatus,
  PhotoCluster,
  PhotoCooccurrenceEdge,
  PhotoCooccurrenceResponse,
  RelationshipRecord,
  RelationshipType,
  SearchRelationshipsResponse,
  TreemichPersonProfile
} from "@treemich/shared";
export type {
  AuthState,
  AuthUser,
  Gender,
  LinkStatus,
  PhotoCluster,
  PhotoCooccurrenceEdge,
  PhotoCooccurrenceResponse,
  RelationshipRecord,
  RelationshipType,
  SearchRelationshipsResponse,
  TreemichPersonProfile
};

const treemichApi = import.meta.env.VITE_TREEMICH_API_URL ?? "/api";
const startupRetryDelayMs = 800;
const startupRetryAttempts = 5;

export type ImmichPerson = SharedImmichPerson & {
  id: string;
  name: string;
  profile?: TreemichPersonProfile | null;
  hasRelationship?: boolean;
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
    const json = (await response.json()) as { error?: string; message?: string };
    return json.error ?? json.message ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

const ensureOk = async (response: Response, fallbackMessage: string) => {
  if (response.ok) {
    return response;
  }

  throw new Error(await getErrorMessage(response, fallbackMessage));
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
  profile: { gender?: Gender; birthDate?: string | null }
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
  relationshipType: RelationshipType
) => {
  const response = await fetch(
    `${treemichApi}/people/${fromPersonId}/relationships`,
    withSession({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ toPersonId, relationshipType })
    })
  );
  await ensureOk(response, "Failed to create relationship");
  return response.json();
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

export const getPhotoCooccurrence = async (options?: {
  minSharedPhotos?: number;
  minScore?: number;
}): Promise<PhotoCooccurrenceResponse> => {
  const query = new URLSearchParams({
    minSharedPhotos: String(Math.max(1, Math.trunc(options?.minSharedPhotos ?? 2))),
    minScore: String(Math.max(0, Math.min(1, options?.minScore ?? 0))),
    t: String(Date.now())
  });

  const response = await fetchWithRetry(`${treemichApi}/people/cooccurrence?${query.toString()}`, {
    cache: "no-store"
  });
  await ensureOk(response, `Failed to load co-occurrence graph (${response.status})`);

  return (await response.json()) as PhotoCooccurrenceResponse;
};
