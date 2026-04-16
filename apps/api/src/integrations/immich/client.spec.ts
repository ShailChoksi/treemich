import { afterEach, describe, expect, it, vi } from "vitest";
import { ImmichClient } from "./client.js";

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
