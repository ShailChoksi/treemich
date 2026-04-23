import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodePlaceQuery } from "./nominatimGeocode.js";

describe("geocodePlaceQuery", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null for blank query without calling the network", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(geocodePlaceQuery("   ")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns coordinates from the first Nominatim hit", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "42.3601", lon: "-71.0589" }]
    });

    const out = await geocodePlaceQuery("Boston, MA");
    expect(out).toEqual({ latitude: 42.3601, longitude: -71.0589 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=Boston%2C%20MA"),
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.stringContaining("Treemich") })
      })
    );
  });

  it("returns null when the response is not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => [] });

    await expect(geocodePlaceQuery("Nowhere")).resolves.toBeNull();
  });

  it("returns null when the body is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });

    await expect(geocodePlaceQuery("Xyzabc")).resolves.toBeNull();
  });

  it("returns null when lat/lon are not numeric", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "nope", lon: "bad" }]
    });

    await expect(geocodePlaceQuery("Somewhere")).resolves.toBeNull();
  });
});
