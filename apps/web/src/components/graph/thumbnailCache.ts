/**
 * @file Module-level thumbnail texture and bitmap caches.
 *
 * These singletons survive component unmounts so that switching workspaces
 * (or re-entering the tree view) does not re-fetch thumbnails from the network.
 * On hard page refreshes the Cache API (in the thumbnail worker) fills the gap.
 */

import { Texture } from "three";

const MAX_CACHE_SIZE = 1000;

const textureCache = new Map<string, Texture>();
const bitmapCache = new Map<string, ImageBitmap>();

/** Returns a cached Three.js Texture for `personId`, or `undefined`. */
export const getCachedTexture = (personId: string): Texture | undefined => textureCache.get(personId);

/** Stores a Three.js Texture in the module-level cache. */
export const setCachedTexture = (personId: string, texture: Texture): void => {
  textureCache.set(personId, texture);
};

/** Returns a cached ImageBitmap for `personId`, or `undefined`. */
export const getCachedBitmap = (personId: string): ImageBitmap | undefined => bitmapCache.get(personId);

/** Stores an ImageBitmap in the module-level cache. */
export const setCachedBitmap = (personId: string, bitmap: ImageBitmap): void => {
  bitmapCache.set(personId, bitmap);
};

/** Returns true when either a Texture or an ImageBitmap is cached for this person. */
export const hasCachedValue = (personId: string): boolean =>
  textureCache.has(personId) || bitmapCache.has(personId);

/**
 * Removes a cached texture (disposes it) and bitmap for `personId`.
 * Use when explicitly evicting — do NOT call on component unmount to avoid
 * destroying textures that will be reused on remount.
 */
export const removeCachedTexture = (personId: string): void => {
  const tex = textureCache.get(personId);
  if (tex) {
    tex.dispose();
    textureCache.delete(personId);
  }
  bitmapCache.delete(personId);
};

export const getCachedTextureSize = (): number => textureCache.size;
export const getCachedBitmapSize = (): number => bitmapCache.size;

/**
 * Evicts the oldest entries when the cache exceeds MAX_CACHE_SIZE.
 * Uses insertion-order iteration (Map preserves insertion order).
 */
export const evictToCap = (): void => {
  if (textureCache.size <= MAX_CACHE_SIZE && bitmapCache.size <= MAX_CACHE_SIZE) {
    return;
  }
  // Evict oldest, preferring entries missing from the other cache.
  const textureKeys = [...textureCache.keys()];
  const over = Math.max(textureCache.size, bitmapCache.size) - MAX_CACHE_SIZE;
  let evicted = 0;
  for (const key of textureKeys) {
    if (evicted >= over) break;
    removeCachedTexture(key);
    evicted++;
  }
};

/** Clears all cached textures and bitmaps. Used by unit tests to avoid cross-test leakage. */
export const clearThumbnailCachesForTests = (): void => {
  const ids = new Set([...textureCache.keys(), ...bitmapCache.keys()]);
  for (const id of ids) {
    removeCachedTexture(id);
  }
};
