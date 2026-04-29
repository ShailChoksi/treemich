/**
 * @file Unit tests for thumbnail HTTP resolution (Cache API + fetch).
 */

import { describe, expect, it, vi } from "vitest";
import { resolveThumbnailHttpResponse } from "./resolveThumbnailHttpResponse";

describe("resolveThumbnailHttpResponse", () => {
  it("returns a cached response when cache.match yields ok", async () => {
    const cached = new Response("cached", { status: 200 });
    const cache = {
      match: vi.fn().mockResolvedValue(cached),
      put: vi.fn().mockResolvedValue(undefined)
    } as unknown as Cache;

    const fetchFn = vi.fn();

    const out = await resolveThumbnailHttpResponse("https://example.com/t.jpg", cache, fetchFn);

    expect(out).toBe(cached);
    expect(cache.match).toHaveBeenCalledWith("https://example.com/t.jpg");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("fetches and puts into cache when no cache hit", async () => {
    const networkBody = new Uint8Array([1, 2, 3]);
    const network = new Response(networkBody, { status: 200 });
    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined)
    } as unknown as Cache;

    const fetchFn = vi.fn().mockResolvedValue(network);

    const out = await resolveThumbnailHttpResponse("https://example.com/t.jpg", cache, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith("https://example.com/t.jpg", { credentials: "include" });
    expect(cache.put).toHaveBeenCalledTimes(1);
    const putArgs = vi.mocked(cache.put).mock.calls[0]!;
    expect(putArgs[0]).toBe("https://example.com/t.jpg");
    expect(putArgs[1]).toBeInstanceOf(Response);

    const bytes = new Uint8Array(await out.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("returns non-ok fetch response without calling put", async () => {
    const network = new Response("err", { status: 404 });
    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn()
    } as unknown as Cache;
    const fetchFn = vi.fn().mockResolvedValue(network);

    const out = await resolveThumbnailHttpResponse("https://example.com/missing", cache, fetchFn);

    expect(out.status).toBe(404);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("skips cache when cache is undefined", async () => {
    const network = new Response("ok", { status: 200 });
    const fetchFn = vi.fn().mockResolvedValue(network);

    const out = await resolveThumbnailHttpResponse("https://example.com/t.jpg", undefined, fetchFn);

    expect(out.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
