import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("mediaStorage", () => {
  let dir: string;

  beforeEach(async () => {
    vi.resetModules();
    dir = await mkdtemp(join(tmpdir(), "treemich-media-"));
    process.env.TREEMICH_MEDIA_STORAGE_DIR = dir;
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:54321/treemich_test";
    process.env.IMMICH_BASE_URL = "http://localhost:2283/api";
    process.env.TREEMICH_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("stores buffers under opaque keys and computes sha256 checksums", async () => {
    const { pathForStorageKey, storeMediaBuffer } = await import("./mediaStorage.js");
    const stored = await storeMediaBuffer(Buffer.from("hello"), { originalName: "portrait.jpg" });

    expect(stored.storageKey).toMatch(/\.jpg$/);
    expect(stored.storageUrl).toBe(`/api/evidence/media/file/${stored.storageKey}`);
    expect(stored.checksum).toHaveLength(64);
    await expect(readFile(pathForStorageKey(stored.storageKey), "utf8")).resolves.toBe("hello");
  });

  it("rejects unsafe storage keys", async () => {
    const { pathForStorageKey } = await import("./mediaStorage.js");
    expect(() => pathForStorageKey("../secret")).toThrow("Invalid media storage key");
  });
});
