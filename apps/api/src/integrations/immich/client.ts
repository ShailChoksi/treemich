import type { ImmichPerson } from "@treemich/shared";

type ImmichPeopleResponse = {
  people: ImmichPerson[];
  total: number;
};

type ImmichPeoplePage = {
  people: ImmichPerson[];
  hasMore: boolean;
  total: number | null;
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
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
};

export class ImmichAuthenticationError extends Error {
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "ImmichAuthenticationError";
  }
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, "");

const sleep = async (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const isRetriableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

const computeRetryDelayMs = (attempt: number, retryBaseDelayMs: number) => {
  const exponentialBackoff = retryBaseDelayMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * retryBaseDelayMs);
  return exponentialBackoff + jitter;
};

export const loginToImmich = async (options: {
  baseUrl: string;
  email: string;
  password: string;
  timeoutMs?: number;
}): Promise<ImmichLoginResponse> => {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${normalizeBaseUrl(options.baseUrl)}/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: options.email,
        password: options.password
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Immich login timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

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
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private peopleCache:
    | {
        expiresAt: number;
        people: ImmichPerson[];
      }
    | undefined;

  private readonly cacheTtlMs = 30_000;
  private readonly thumbnailCacheTtlMs = 10 * 60_000;
  private readonly maxThumbnailCacheEntries = 250;
  private readonly maxThumbnailCacheBytes = 25 * 1024 * 1024;
  private readonly maxThumbnailBytes = 2 * 1024 * 1024;
  private readonly metadataPageSize = 1000;
  private readonly metadataRequestConcurrency = 2;
  private readonly defaultMaxAssetsWithPeople = 25_000;
  private thumbnailCacheBytes = 0;
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
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.retryBaseDelayMs = Math.max(25, options.retryBaseDelayMs ?? 200);
  }

  clearExpiredCacheEntries(now = Date.now()) {
    if (this.peopleCache && this.peopleCache.expiresAt <= now) {
      this.peopleCache = undefined;
    }

    for (const [personId, cached] of this.thumbnailCache.entries()) {
      if (cached.expiresAt <= now) {
        this.thumbnailCacheBytes -= cached.data.byteLength;
        this.thumbnailCache.delete(personId);
      }
    }
  }

  dispose() {
    this.peopleCache = undefined;
    this.thumbnailCache.clear();
    this.thumbnailCacheBytes = 0;
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

  private async request(
    action: string,
    pathOrUrl: string | URL,
    init?: Omit<RequestInit, "signal"> & { skipRetries?: boolean }
  ) {
    const skipRetries = init?.skipRetries === true;
    const attempts = skipRetries ? 0 : this.maxRetries;
    const url = typeof pathOrUrl === "string" ? `${this.baseUrl}${pathOrUrl}` : pathOrUrl;
    const requestInit = { ...init };
    delete requestInit.skipRetries;

    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          ...requestInit,
          signal: controller.signal
        });

        if (response.status === 401 || response.status === 403) {
          return response;
        }

        if (response.ok || !isRetriableStatus(response.status) || attempt === attempts) {
          return response;
        }
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "AbortError" || attempt === attempts) {
          throw error;
        }
      } finally {
        clearTimeout(timeout);
      }

      await sleep(computeRetryDelayMs(attempt, this.retryBaseDelayMs));
    }

    throw new Error(`Immich ${action} failed after retries`);
  }

  async listPeople(): Promise<ImmichPerson[]> {
    this.clearExpiredCacheEntries();

    if (this.peopleCache && this.peopleCache.expiresAt > Date.now()) {
      return this.peopleCache.people;
    }

    const people: ImmichPerson[] = [];
    let page = 1;
    let expectedTotal: number | null = null;

    while (expectedTotal === null || people.length < expectedTotal) {
      const pageResult = await this.listPeoplePage(page);
      people.push(...pageResult.people);
      expectedTotal = pageResult.total ?? expectedTotal;
      if (!pageResult.hasMore) {
        break;
      }
      page += 1;
    }

    this.peopleCache = {
      expiresAt: Date.now() + this.cacheTtlMs,
      people
    };
    return people;
  }

  async findPeopleByName(queryName: string): Promise<ImmichPerson[]> {
    const normalized = queryName.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const matches: ImmichPerson[] = [];
    let page = 1;
    while (true) {
      const pageResult = await this.listPeoplePage(page);
      matches.push(...pageResult.people.filter((person) => person.name.toLowerCase().includes(normalized)));
      if (!pageResult.hasMore) {
        break;
      }
      page += 1;
    }
    return matches;
  }

  async getPeopleByIds(personIds: Iterable<string>): Promise<ImmichPerson[]> {
    const missingIds = new Set([...personIds].filter((id) => id.length > 0));
    if (missingIds.size === 0) {
      return [];
    }

    this.clearExpiredCacheEntries();
    if (this.peopleCache && this.peopleCache.expiresAt > Date.now()) {
      return this.peopleCache.people.filter((person) => missingIds.has(person.id));
    }

    const found: ImmichPerson[] = [];
    let page = 1;
    while (missingIds.size > 0) {
      const pageResult = await this.listPeoplePage(page);
      for (const person of pageResult.people) {
        if (!missingIds.has(person.id)) {
          continue;
        }
        found.push(person);
        missingIds.delete(person.id);
      }

      if (!pageResult.hasMore) {
        break;
      }
      page += 1;
    }

    return found;
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

    const response = await this.request("thumbnail", `/people/${personId}/thumbnail`, {
      headers: this.buildHeaders()
    });
    await this.ensureOk(response, "thumbnail");

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength > this.maxThumbnailBytes) {
      throw new Error(`Immich thumbnail exceeded ${this.maxThumbnailBytes} bytes`);
    }
    this.thumbnailCache.set(personId, {
      expiresAt: Date.now() + this.thumbnailCacheTtlMs,
      contentType,
      data
    });
    this.thumbnailCacheBytes += data.byteLength;
    while (
      this.thumbnailCache.size > this.maxThumbnailCacheEntries ||
      this.thumbnailCacheBytes > this.maxThumbnailCacheBytes
    ) {
      const oldestKey = this.thumbnailCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      const oldest = this.thumbnailCache.get(oldestKey);
      if (oldest) {
        this.thumbnailCacheBytes -= oldest.data.byteLength;
      }
      this.thumbnailCache.delete(oldestKey);
    }
    return { contentType, data };
  }

  async listAssetsWithPeople(maxAssets = this.defaultMaxAssetsWithPeople): Promise<ImmichAssetPeople[]> {
    const itemsByPage = new Map<number, unknown[]>();
    const queuedPages = new Set<number>([1]);
    const fetchedPages = new Set<number>();
    const pageQueue: number[] = [1];
    let bufferedItemCount = 0;
    let queueIndex = 0;
    let reachedTerminalPage = false;

    const resolveNextPage = (currentPage: number, nextPageCandidate: string | number | null | undefined) => {
      if (typeof nextPageCandidate === "number" && Number.isFinite(nextPageCandidate)) {
        return nextPageCandidate > currentPage ? nextPageCandidate : null;
      }
      if (typeof nextPageCandidate === "string") {
        const normalized = nextPageCandidate.trim();
        if (!normalized) {
          return null;
        }
        const numeric = Number.parseInt(normalized, 10);
        if (!Number.isFinite(numeric)) {
          return null;
        }
        return numeric > currentPage ? numeric : null;
      }
      return null;
    };

    const fetchPage = async (page: number) => {
      const body = {
        page,
        size: this.metadataPageSize,
        withPeople: true,
        type: "IMAGE"
      };
      const response = await this.request("listAssetsWithPeople", "/search/metadata", {
        method: "POST",
        headers: this.buildHeaders({
          "content-type": "application/json"
        }),
        body: JSON.stringify(body)
      });
      await this.ensureOk(response, "listAssetsWithPeople");

      const json = (await response.json()) as ImmichAssetPeoplePageResponse;
      const pageItems = json.assets?.items ?? [];
      fetchedPages.add(page);
      if (pageItems.length === 0) {
        reachedTerminalPage = true;
        return;
      }

      itemsByPage.set(page, pageItems);
      bufferedItemCount += pageItems.length;
      if (bufferedItemCount >= maxAssets) {
        return;
      }

      const nextPageCandidate = json.assets?.nextPage ?? json.nextPage;
      const nextPage = resolveNextPage(page, nextPageCandidate);
      if (nextPage === null) {
        reachedTerminalPage = true;
        return;
      }
      if (queuedPages.has(nextPage) || fetchedPages.has(nextPage)) {
        return;
      }
      queuedPages.add(nextPage);
      pageQueue.push(nextPage);
    };

    const workers = Array.from({ length: this.metadataRequestConcurrency }, async () => {
      while (queueIndex < pageQueue.length && bufferedItemCount < maxAssets && !reachedTerminalPage) {
        const page = pageQueue[queueIndex];
        queueIndex += 1;
        if (page === undefined) {
          continue;
        }
        await fetchPage(page);
      }
    });
    await Promise.all(workers);

    const allItems = [...itemsByPage.entries()]
      .sort(([leftPage], [rightPage]) => leftPage - rightPage)
      .flatMap(([, items]) => items)
      .slice(0, maxAssets);

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

  private async listPeoplePage(page: number): Promise<ImmichPeoplePage> {
    const url = new URL(`${this.baseUrl}/people`);
    url.searchParams.set("size", String(this.peoplePageSize));
    url.searchParams.set("page", String(page));
    const response = await this.request("listPeople", url, {
      headers: this.buildHeaders()
    });
    await this.ensureOk(response, "listPeople");

    const json = (await response.json()) as ImmichPeopleResponse | ImmichPerson[];
    if (Array.isArray(json)) {
      return {
        people: json,
        hasMore: json.length >= this.peoplePageSize,
        total: null
      };
    }

    const pagePeople = json.people ?? [];
    const total = Number.isFinite(json.total) ? json.total : pagePeople.length;
    const hasMore =
      pagePeople.length > 0 &&
      (pagePeople.length >= this.peoplePageSize || page * this.peoplePageSize < total);
    return {
      people: pagePeople,
      hasMore,
      total
    };
  }
}
