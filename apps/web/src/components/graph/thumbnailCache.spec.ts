/**
 * @file Unit tests for the module-level thumbnail cache.
 */

import { Texture } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCachedTexture,
  setCachedTexture,
  getCachedBitmap,
  setCachedBitmap,
  hasCachedValue,
  removeCachedTexture,
  evictToCap,
  clearThumbnailCachesForTests
} from "./thumbnailCache";

afterEach(() => {
  clearThumbnailCachesForTests();
});

describe("thumbnailCache", () => {
  describe("getCachedTexture / setCachedTexture", () => {
    it("returns undefined for uncached IDs", () => {
      expect(getCachedTexture("nonexistent")).toBeUndefined();
    });

    it("returns the stored Texture for a cached ID", () => {
      const texture = new Texture();
      setCachedTexture("person-1", texture);
      expect(getCachedTexture("person-1")).toBe(texture);
    });

    it("overwrites an existing entry when set again", () => {
      const texture1 = new Texture();
      const texture2 = new Texture();
      setCachedTexture("person-1", texture1);
      setCachedTexture("person-1", texture2);
      expect(getCachedTexture("person-1")).toBe(texture2);
    });
  });

  describe("getCachedBitmap / setCachedBitmap", () => {
    it("returns undefined for uncached IDs", () => {
      expect(getCachedBitmap("nonexistent")).toBeUndefined();
    });

    it("returns the stored ImageBitmap for a cached ID", () => {
      const bitmap = { width: 100, height: 100 } as ImageBitmap;
      setCachedBitmap("person-1", bitmap);
      expect(getCachedBitmap("person-1")).toBe(bitmap);
    });
  });

  describe("hasCachedValue", () => {
    it("returns false when nothing is cached for the ID", () => {
      expect(hasCachedValue("nonexistent")).toBe(false);
    });

    it("returns true when a texture is cached", () => {
      setCachedTexture("person-1", new Texture());
      expect(hasCachedValue("person-1")).toBe(true);
    });

    it("returns true when a bitmap is cached", () => {
      setCachedBitmap("person-1", { width: 1, height: 1 } as ImageBitmap);
      expect(hasCachedValue("person-1")).toBe(true);
    });
  });

  describe("removeCachedTexture", () => {
    it("removes both texture and bitmap for the ID", () => {
      setCachedTexture("person-1", new Texture());
      setCachedBitmap("person-1", { width: 1, height: 1 } as ImageBitmap);
      removeCachedTexture("person-1");
      expect(hasCachedValue("person-1")).toBe(false);
    });

    it("disposes the texture when removing", () => {
      const disposeFn = vi.fn();
      const texture = new Texture();
      texture.dispose = disposeFn;
      setCachedTexture("person-1", texture);
      removeCachedTexture("person-1");
      expect(disposeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("evictToCap", () => {
    it("does not remove entries when under the cap", () => {
      setCachedTexture("person-1", new Texture());
      setCachedBitmap("person-1", { width: 1, height: 1 } as ImageBitmap);
      evictToCap();
      expect(hasCachedValue("person-1")).toBe(true);
    });
  });
});
