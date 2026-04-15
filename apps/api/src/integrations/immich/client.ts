import type { ImmichPerson } from "@treemich/shared";

type ImmichPeopleResponse = {
  people: ImmichPerson[];
  total: number;
};

type ImmichAssetPeoplePageResponse = {
  assets?: {
    items?: unknown[];
    nextPage?: string | number | null;
    total?: number;
  };
  nextPage?: string | number | null;
};

export type ImmichAssetPeople = {
  assetId: string;
  personIds: string[];
};

type ImmichLoginResponse = {
  accessToken: string;
  userId: string;
  userEmail: string;
  name: string;
  isAdmin: boolean;
  shouldChangePassword: boolean;
  isOnboarded: boolean;
  profileImagePath?: string | null;
};

type ImmichClientOptions = {
  baseUrl: string;
  accessToken: string;
  peoplePageSize?: number;
};

export class ImmichAuthenticationError extends Error {
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "ImmichAuthenticationError";
  }
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, "");

export const loginToImmich = async (options: {
  baseUrl: string;
  email: string;
  password: string;
}): Promise<ImmichLoginResponse> => {
  const response = await fetch(`${normalizeBaseUrl(options.baseUrl)}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      email: options.email,
      password: options.password
    })
  });

  if (response.status === 401) {
    throw new ImmichAuthenticationError("Incorrect Immich email or password");
  }

  if (!response.ok) {
    throw new Error(`Immich login failed with ${response.status}`);
  }

  return (await response.json()) as ImmichLoginResponse;
};

export class ImmichClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly peoplePageSize: number;
  private peopleCache:
    | {
        expiresAt: number;
        people: ImmichPerson[];
      }
    | undefined;

  private readonly cacheTtlMs = 30_000;
  private readonly thumbnailCacheTtlMs = 10 * 60_000;
  private readonly maxThumbnailCacheEntries = 1000;
  private readonly metadataPageSize = 1000;
  private thumbnailCache = new Map<
    string,
    {
      expiresAt: number;
      contentType: string;
      data: Buffer;
    }
  >();

  constructor(options: ImmichClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.accessToken = options.accessToken;
    this.peoplePageSize = options.peoplePageSize ?? 1000;
  }

  clearExpiredCacheEntries(now = Date.now()) {
    if (this.peopleCache && this.peopleCache.expiresAt <= now) {
      this.peopleCache = undefined;
    }

    for (const [personId, cached] of this.thumbnailCache.entries()) {
      if (cached.expiresAt <= now) {
        this.thumbnailCache.delete(personId);
      }
    }
  }

  dispose() {
    this.peopleCache = undefined;
    this.thumbnailCache.clear();
  }

  private buildHeaders(extraHeaders?: Record<string, string>) {
    return {
      authorization: `Bearer ${this.accessToken}`,
      ...(extraHeaders ?? {})
    };
  }

  private async ensureOk(response: Response, action: string) {
    if (response.status === 401 || response.status === 403) {
      throw new ImmichAuthenticationError(`Immich ${action} requires a fresh login`);
    }

    if (!response.ok) {
      throw new Error(`Immich ${action} failed with ${response.status}`);
    }
  }

  async listPeople(): Promise<ImmichPerson[]> {
    this.clearExpiredCacheEntries();

    if (this.peopleCache && this.peopleCache.expiresAt > Date.now()) {
      return this.peopleCache.people;
    }

    const response = await fetch(`${this.baseUrl}/people?size=${this.peoplePageSize}`, {
      headers: this.buildHeaders()
    });
    await this.ensureOk(response, "listPeople");

    const json = (await response.json()) as ImmichPeopleResponse | ImmichPerson[];
    const people = Array.isArray(json) ? json : (json.people ?? []);
    this.peopleCache = {
      expiresAt: Date.now() + this.cacheTtlMs,
      people
    };
    return people;
  }

  async findPeopleByName(queryName: string): Promise<ImmichPerson[]> {
    const normalized = queryName.trim().toLowerCase();
    const people = await this.listPeople();
    return people.filter((person) => person.name.toLowerCase().includes(normalized));
  }

  async getPersonThumbnail(personId: string): Promise<{
    contentType: string;
    data: Buffer;
  }> {
    this.clearExpiredCacheEntries();

    const cached = this.thumbnailCache.get(personId);
    if (cached && cached.expiresAt > Date.now()) {
      // Refresh insertion order to keep this cache LRU-like.
      this.thumbnailCache.delete(personId);
      this.thumbnailCache.set(personId, cached);
      return { contentType: cached.contentType, data: cached.data };
    }

    const response = await fetch(`${this.baseUrl}/people/${personId}/thumbnail`, {
      headers: this.buildHeaders()
    });
    await this.ensureOk(response, "thumbnail");

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const data = Buffer.from(await response.arrayBuffer());
    this.thumbnailCache.set(personId, {
      expiresAt: Date.now() + this.thumbnailCacheTtlMs,
      contentType,
      data
    });
    while (this.thumbnailCache.size > this.maxThumbnailCacheEntries) {
      const oldestKey = this.thumbnailCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.thumbnailCache.delete(oldestKey);
    }
    return { contentType, data };
  }

  async listAssetsWithPeople(maxAssets = 50_000): Promise<ImmichAssetPeople[]> {
    const allItems: unknown[] = [];
    let page = 1;
    while (allItems.length < maxAssets) {
      const body = {
        page,
        size: this.metadataPageSize,
        withPeople: true,
        type: "IMAGE"
      };
      const response = await fetch(`${this.baseUrl}/search/metadata`, {
        method: "POST",
        headers: this.buildHeaders({
          "content-type": "application/json"
        }),
        body: JSON.stringify(body)
      });
      await this.ensureOk(response, "listAssetsWithPeople");

      const json = (await response.json()) as ImmichAssetPeoplePageResponse;
      const pageItems = json.assets?.items ?? [];
      allItems.push(...pageItems);

      const nextPageCandidate = json.assets?.nextPage ?? json.nextPage;
      const hasNumericNextPage = typeof nextPageCandidate === "number" && Number.isFinite(nextPageCandidate);
      const hasStringNextPage = typeof nextPageCandidate === "string" && nextPageCandidate.trim().length > 0;
      if (pageItems.length === 0 || (!hasNumericNextPage && !hasStringNextPage)) {
        break;
      }

      if (hasNumericNextPage) {
        page = nextPageCandidate;
        continue;
      }

      page += 1;
    }

    return allItems
      .map((item) => this.toAssetPeople(item))
      .filter((item): item is ImmichAssetPeople => item !== null);
  }

  private toAssetPeople(item: unknown): ImmichAssetPeople | null {
    if (!item || typeof item !== "object") {
      return null;
    }

    const candidate = item as {
      id?: unknown;
      assetId?: unknown;
      people?: unknown;
      persons?: unknown;
      faces?: unknown;
    };

    const assetId = this.toStringId(candidate.id) ?? this.toStringId(candidate.assetId);
    if (!assetId) {
      return null;
    }

    const rawPeople = Array.isArray(candidate.people)
      ? candidate.people
      : Array.isArray(candidate.persons)
        ? candidate.persons
        : Array.isArray(candidate.faces)
          ? candidate.faces
          : [];

    const personIds = [
      ...new Set(rawPeople.map((entry) => this.extractPersonId(entry)).filter((id): id is string => !!id))
    ];
    if (personIds.length < 2) {
      return null;
    }

    return {
      assetId,
      personIds
    };
  }

  private extractPersonId(entry: unknown): string | null {
    if (typeof entry === "string") {
      return entry;
    }
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const candidate = entry as {
      id?: unknown;
      personId?: unknown;
      person?: { id?: unknown };
    };

    return (
      this.toStringId(candidate.id) ??
      this.toStringId(candidate.personId) ??
      this.toStringId(candidate.person?.id)
    );
  }

  private toStringId(value: unknown): string | null {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    return null;
  }
}
