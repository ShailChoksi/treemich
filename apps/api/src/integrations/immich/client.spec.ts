import { afterEach, describe, expect, it, vi } from "vitest";
import { ImmichClient, ImmichAuthenticationError, loginToImmich } from "./client.js";

type MetadataPayload = {
  assets: {
    items: unknown[];
    nextPage?: number | string | null;
  };
};

const metadataResponse = (payload: MetadataPayload) =>
  ({
    ok: true,
    status: 200,
    json: async () => payload
  }) as Response;

const jsonResponse = (payload: unknown, headers = new Headers()) =>
  ({
    ok: true,
    status: 200,
    headers,
    json: async () => payload,
    arrayBuffer: async () => new ArrayBuffer(0)
  }) as Response;

describe("ImmichClient.listPeople", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("paginates until the reported total is loaded", async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      const page = url.searchParams.get("page");
      if (page === "1") {
        return jsonResponse({
          total: 3,
          people: [
            { id: "p1", name: "One" },
            { id: "p2", name: "Two" }
          ]
        });
      }
      return jsonResponse({
        total: 3,
        people: [{ id: "p3", name: "Three" }]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ImmichClient({
      baseUrl: "http://immich.local",
      accessToken: "token",
      peoplePageSize: 2
    });

    const people = await client.listPeople();

    expect(people.map((person) => person.id)).toEqual(["p1", "p2", "p3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries transient failures before succeeding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503
      } as Response)
      .mockResolvedValueOnce(
        jsonResponse({
          total: 1,
          people: [{ id: "p1", name: "One" }]
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new ImmichClient({
      baseUrl: "http://immich.local",
      accessToken: "token",
      maxRetries: 1,
      retryBaseDelayMs: 1
    });

    const people = await client.listPeople();
    expect(people.map((person) => person.id)).toEqual(["p1"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = new ImmichClient({
      baseUrl: "http://immich.local",
      accessToken: "token",
      maxRetries: 3
    });

    await expect(client.listPeople()).rejects.toBeInstanceOf(ImmichAuthenticationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ImmichClient.listAssetsWithPeople", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("follows explicit nextPage progression and keeps deterministic output order", async () => {
    const responseByPage = new Map<number, MetadataPayload>([
      [
        1,
        {
          assets: {
            items: [{ id: "asset-1", people: [{ id: "p1" }, { id: "p2" }] }],
            nextPage: 3
          }
        }
      ],
      [
        3,
        {
          assets: {
            items: [{ id: "asset-3", people: [{ id: "p3" }, { id: "p4" }] }],
            nextPage: "5"
          }
        }
      ],
      [
        5,
        {
          assets: {
            items: [{ id: "asset-5", people: [{ id: "p5" }, { id: "p6" }] }],
            nextPage: null
          }
        }
      ]
    ]);

    const fetchMock = vi.fn(async (_url: string, options?: { body?: string }) => {
      const body = JSON.parse(options?.body ?? "{}") as { page?: number };
      const page = body.page ?? 1;
      const payload = responseByPage.get(page);
      if (!payload) {
        throw new Error(`Unexpected page ${page}`);
      }
      return metadataResponse(payload);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ImmichClient({
      baseUrl: "http://immich.local",
      accessToken: "token"
    });

    const assets = await client.listAssetsWithPeople();
    expect(assets.map((asset) => asset.assetId)).toEqual(["asset-1", "asset-3", "asset-5"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops when an empty page is returned", async () => {
    const fetchMock = vi.fn(async (_url: string, options?: { body?: string }) => {
      const body = JSON.parse(options?.body ?? "{}") as { page?: number };
      const page = body.page ?? 1;
      if (page === 1) {
        return metadataResponse({
          assets: {
            items: [{ id: "asset-1", people: [{ id: "p1" }, { id: "p2" }] }],
            nextPage: 2
          }
        });
      }
      return metadataResponse({
        assets: {
          items: [],
          nextPage: 3
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ImmichClient({
      baseUrl: "http://immich.local",
      accessToken: "token"
    });

    const assets = await client.listAssetsWithPeople();
    expect(assets).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("loginToImmich", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("forwards auth failures without retries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401
      } as Response)
    );

    await expect(
      loginToImmich({
        baseUrl: "http://immich.local",
        email: "a@example.com",
        password: "pw"
      })
    ).rejects.toBeInstanceOf(ImmichAuthenticationError);
  });
});
