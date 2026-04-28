/**
 * @file Graph-related React hook: useThumbnailLoader.
 *
 * Loads person thumbnails via a web worker, seeds from a module-level texture
 * cache so cached textures are instantly available on mount, and writes back
 * to the cache so they survive component unmounts (workspace switches).
 * Calls invalidate() on the R3F canvas after new textures arrive so they
 * appear immediately without a user interaction.
 */

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { SRGBColorSpace, Texture } from "three";
import type { Vector3 } from "three";
import { useThree } from "@react-three/fiber";
import { personThumbnailUrl } from "../../lib/api";
import { loadThumbnailBatch } from "./thumbnailWorkerClient";
import type { NodePosition } from "./layout";
import { distanceSquared } from "./layout";
import {
  getCachedTexture,
  setCachedTexture,
  setCachedBitmap,
  hasCachedValue,
  evictToCap,
  removeCachedTexture
} from "./thumbnailCache";

const CAMERA_THUMBNAIL_BATCH = 10;
const THUMBNAIL_BATCH_SIZE = 5;
const THUMBNAIL_BATCH_INTERVAL_MS = 750;
const CAMERA_SAMPLE_INTERVAL_MS = 140;
const THUMBNAIL_BACKOFF_BASE_MS = 1000;
const THUMBNAIL_BACKOFF_MAX_MS = 4000;
const EMPTY_THUMBNAIL_CACHE_KEYS: Record<string, string | undefined> = {};

type PositionedPerson = {
  person: { id: string };
  displayPosition: NodePosition;
};

/**
 * Applies a cover crop to the texture so it fills the circular node geometry
 * without letterboxing, centering the image and preserving aspect ratio.
 * Exported so PersonNode can reuse it in its TextureLoader fallback path.
 */
export const applyCoverCrop = (texture: Texture) => {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 1;
  const height = image?.height ?? 1;

  texture.colorSpace = SRGBColorSpace;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);

  if (width > height) {
    const xRepeat = height / width;
    texture.repeat.set(xRepeat, 1);
    texture.offset.set((1 - xRepeat) / 2, 0);
  } else if (height > width) {
    const yRepeat = width / height;
    texture.repeat.set(1, yRepeat);
    texture.offset.set(0, (1 - yRepeat) / 2);
  }

  texture.needsUpdate = true;
};

const createTextureFromBitmap = (bitmap: ImageBitmap): Texture => {
  const texture = new Texture(bitmap as unknown as HTMLImageElement);
  // WebGL2's UNPACK_FLIP_Y_WEBGL has no effect on ImageBitmap. The bitmap
  // was pre-flipped via imageOrientation:"flipY" in the worker, so disable
  // Three.js's own flip to avoid a double-flip.
  texture.flipY = false;
  applyCoverCrop(texture);
  return texture;
};

const dedupePreservingOrder = (ids: Iterable<string>) => {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push(id);
  }
  return next;
};

export const buildThumbnailLoadOrder = ({
  renderNearPersonIds,
  prioritizedNodeIds,
  nearCameraNodeIds,
  visibleIdsByDistance
}: {
  renderNearPersonIds: string[];
  prioritizedNodeIds: Set<string>;
  nearCameraNodeIds: string[];
  visibleIdsByDistance: string[];
}) =>
  dedupePreservingOrder([
    ...renderNearPersonIds,
    ...prioritizedNodeIds,
    ...nearCameraNodeIds,
    ...visibleIdsByDistance
  ]);

export const pickThumbnailBatch = ({
  loadOrder,
  loadedIds,
  inFlightIds,
  batchSize
}: {
  loadOrder: string[];
  loadedIds: Set<string>;
  inFlightIds: Set<string>;
  batchSize: number;
}) => {
  const nextBatch: string[] = [];
  for (const id of loadOrder) {
    if (nextBatch.length >= batchSize) {
      break;
    }
    // Skip IDs that are already loaded in React state or in the module-level cache.
    if (!id || loadedIds.has(id) || inFlightIds.has(id) || hasCachedValue(id)) {
      continue;
    }
    nextBatch.push(id);
  }
  return nextBatch;
};

export const resolveNextThumbnailBackoffMs = ({
  failureStreak,
  baseMs = THUMBNAIL_BACKOFF_BASE_MS,
  maxMs = THUMBNAIL_BACKOFF_MAX_MS
}: {
  failureStreak: number;
  baseMs?: number;
  maxMs?: number;
}) => Math.min(maxMs, baseMs * Math.max(1, 2 ** (failureStreak - 1)));

const pickNearestIds = (items: PositionedPerson[], origin: NodePosition, limit: number) => {
  if (limit <= 0 || items.length === 0) {
    return [];
  }

  const nearest: Array<{ id: string; distance: number }> = [];
  for (const item of items) {
    const candidate = {
      id: item.person.id,
      distance: distanceSquared(item.displayPosition, origin)
    };

    if (nearest.length === 0) {
      nearest.push(candidate);
      continue;
    }

    let insertAt = nearest.length;
    while (insertAt > 0 && nearest[insertAt - 1] && nearest[insertAt - 1]!.distance > candidate.distance) {
      insertAt -= 1;
    }

    if (nearest.length < limit) {
      nearest.splice(insertAt, 0, candidate);
      continue;
    }

    const last = nearest[nearest.length - 1];
    if (!last || candidate.distance >= last.distance) {
      continue;
    }

    nearest.splice(insertAt, 0, candidate);
    nearest.pop();
  }

  return nearest.map((item) => item.id);
};

/**
 * React hook that manages progressive thumbnail loading for the 3D graph.
 *
 * Seeds from the module-level texture cache on mount so previously-loaded
 * thumbnails appear instantly. Writes new textures back to the cache so they
 * survive workspace switches. Also calls invalidate() on new textures so they
 * immediately render on the canvas.
 */
export const useThumbnailLoader = ({
  peopleIds,
  thumbnailCacheKeys = EMPTY_THUMBNAIL_CACHE_KEYS,
  prioritizedNodeIds,
  renderNearPersonIds,
  displayVisiblePeople,
  cameraSampleRef,
  visible
}: {
  peopleIds: string[];
  thumbnailCacheKeys?: Record<string, string | undefined>;
  prioritizedNodeIds: Set<string>;
  renderNearPersonIds: string[];
  displayVisiblePeople: PositionedPerson[];
  cameraSampleRef: MutableRefObject<Vector3>;
  /** When false, the thumbnail loading loop is paused (graph not visible). */
  visible?: boolean;
}) => {
  // Seed the React state from the module-level cache on every mount so cached
  // textures are immediately available.
  const [thumbnailTextures, setThumbnailTextures] = useState<Map<string, Texture>>(() => {
    const initial = new Map<string, Texture>();
    for (const id of peopleIds) {
      const cached = getCachedTexture(id);
      if (cached) {
        initial.set(id, cached);
      }
    }
    return initial;
  });

  /** Always latest map for queue drain without listing `thumbnailTextures` in effect deps. */
  const thumbnailTexturesRef = useRef(thumbnailTextures);
  thumbnailTexturesRef.current = thumbnailTextures;
  const [nearCameraNodeIds, setNearCameraNodeIds] = useState<string[]>([]);
  const [backoffUntilMs, setBackoffUntilMs] = useState(0);
  const inFlightIdsRef = useRef(new Set<string>());
  const isDrainActiveRef = useRef(false);
  const failureStreakRef = useRef(0);
  const thumbnailCacheKeysRef = useRef<Record<string, string | undefined>>(thumbnailCacheKeys);

  useEffect(() => {
    if (displayVisiblePeople.length === 0 || visible === false) {
      setNearCameraNodeIds((current) => (current.length === 0 ? current : []));
      return;
    }

    const updateNearest = () => {
      const samplePosition: NodePosition = [
        cameraSampleRef.current.x,
        cameraSampleRef.current.y,
        cameraSampleRef.current.z
      ];
      const nextNearest = pickNearestIds(displayVisiblePeople, samplePosition, CAMERA_THUMBNAIL_BATCH);
      setNearCameraNodeIds((current) => {
        if (
          current.length === nextNearest.length &&
          current.every((value, index) => value === nextNearest[index])
        ) {
          return current;
        }
        return nextNearest;
      });
    };

    updateNearest();
    const interval = window.setInterval(updateNearest, CAMERA_SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [cameraSampleRef, displayVisiblePeople, visible]);

  const visibleIdsByDistance = useMemo(() => {
    return displayVisiblePeople.map((item) => item.person.id);
  }, [displayVisiblePeople]);

  const prevLoadOrderRef = useRef<string[]>([]);
  const thumbnailLoadOrder = useMemo(() => {
    const next = buildThumbnailLoadOrder({
      renderNearPersonIds,
      prioritizedNodeIds,
      nearCameraNodeIds,
      visibleIdsByDistance
    });
    const prev = prevLoadOrderRef.current;
    if (next.length === prev.length && next.every((v, i) => v === prev[i])) {
      return prev;
    }
    prevLoadOrderRef.current = next;
    return next;
  }, [nearCameraNodeIds, prioritizedNodeIds, renderNearPersonIds, visibleIdsByDistance]);

  // Dispose textures for people that have been removed from the graph.
  // Do NOT dispose textures for people still in the module cache — they'll
  // be reused when the person re-enters the visible set on a workspace switch.
  useEffect(() => {
    const existingPeopleIds = new Set(peopleIds);
    inFlightIdsRef.current.forEach((id) => {
      if (!existingPeopleIds.has(id)) {
        inFlightIdsRef.current.delete(id);
      }
    });
    setThumbnailTextures((current) => {
      let changed = false;
      const next = new Map<string, Texture>();
      for (const [id, texture] of current) {
        if (!existingPeopleIds.has(id) && !getCachedTexture(id)) {
          // Only dispose if not in the module cache (which retains it for remounts).
          texture.dispose();
          changed = true;
          continue;
        }
        next.set(id, texture);
      }
      return changed ? next : current;
    });
  }, [peopleIds]);

  // Imported or uploaded thumbnails can replace an already cached generated/provider fallback.
  // Evict by person id when the person's thumbnail metadata revision changes.
  useEffect(() => {
    const previousKeys = thumbnailCacheKeysRef.current;
    const evictedIds = new Set<string>();

    for (const id of peopleIds) {
      const previousKey = previousKeys[id];
      const nextKey = thumbnailCacheKeys[id];
      if (previousKey && nextKey && previousKey !== nextKey) {
        removeCachedTexture(id);
        inFlightIdsRef.current.delete(id);
        evictedIds.add(id);
      }
    }

    thumbnailCacheKeysRef.current = thumbnailCacheKeys;

    if (evictedIds.size === 0) {
      return;
    }

    setThumbnailTextures((current) => {
      let changed = false;
      const next = new Map(current);
      for (const id of evictedIds) {
        if (next.delete(id)) {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [peopleIds, thumbnailCacheKeys]);

  const isPaused = visible === false;

  useEffect(() => {
    if (isPaused || thumbnailLoadOrder.length === 0) {
      return;
    }
    let isDisposed = false;

    const drainQueue = async () => {
      if (isDisposed || isDrainActiveRef.current) {
        return;
      }
      if (Date.now() < backoffUntilMs) {
        return;
      }
      const batch = pickThumbnailBatch({
        loadOrder: thumbnailLoadOrder,
        loadedIds: new Set(thumbnailTexturesRef.current.keys()),
        inFlightIds: inFlightIdsRef.current,
        batchSize: THUMBNAIL_BATCH_SIZE
      });
      if (batch.length === 0) {
        return;
      }
      isDrainActiveRef.current = true;
      batch.forEach((id) => inFlightIdsRef.current.add(id));

      try {
        const items = batch.map((personId) => ({
          personId,
          url: personThumbnailUrl(personId, thumbnailCacheKeys[personId])
        }));
        const results = await loadThumbnailBatch(items);

        if (!isDisposed) {
          const newTextures: Array<[string, Texture]> = [];
          let hasFailure = false;

          for (const result of results) {
            if (result.status === "fulfilled") {
              // Store bitmap in the module-level cache.
              setCachedBitmap(result.personId, result.bitmap);
              const texture = createTextureFromBitmap(result.bitmap);
              // Store texture in the module-level cache.
              setCachedTexture(result.personId, texture);
              newTextures.push([result.personId, texture]);
            } else {
              hasFailure = true;
            }
          }

          if (newTextures.length > 0) {
            setThumbnailTextures((current) => {
              const next = new Map(current);
              for (const [id, texture] of newTextures) {
                next.set(id, texture);
              }
              return next;
            });
            // Evict oldest entries when cache exceeds limit.
            evictToCap();
          }

          if (hasFailure) {
            failureStreakRef.current += 1;
            const delayMs = resolveNextThumbnailBackoffMs({
              failureStreak: failureStreakRef.current
            });
            setBackoffUntilMs(Date.now() + delayMs);
          } else if (newTextures.length > 0) {
            failureStreakRef.current = 0;
          }
        }
      } finally {
        batch.forEach((id) => inFlightIdsRef.current.delete(id));
        isDrainActiveRef.current = false;
      }
    };

    void drainQueue();
    const interval = window.setInterval(() => {
      void drainQueue();
    }, THUMBNAIL_BATCH_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.clearInterval(interval);
    };
  }, [backoffUntilMs, thumbnailLoadOrder, isPaused, thumbnailCacheKeys]);

  const thumbnailNodeIds = useMemo(() => new Set(thumbnailTextures.keys()), [thumbnailTextures]);

  // Compute loading progress for the progress indicator.
  // totalCount = number of currently visible people that need thumbnails;
  // loadedCount = how many have textures (from state or module cache).
  const thumbnailProgress = useMemo(() => {
    const total = thumbnailLoadOrder.length;
    const loaded = thumbnailLoadOrder.filter((id) => thumbnailNodeIds.has(id) || hasCachedValue(id)).length;
    return { loaded, total };
  }, [thumbnailLoadOrder, thumbnailNodeIds]);

  return {
    thumbnailNodeIds,
    thumbnailTextures,
    thumbnailProgress
  };
};

/**
 * Component placed inside the R3F Canvas that calls invalidate()
 * whenever the thumbnail texture count grows, ensuring newly-loaded
 * thumbnails render immediately without requiring a user interaction.
 */
export const InvalidateOnThumbnailUpdate = ({
  thumbnailTextures,
  visible
}: {
  thumbnailTextures: Map<string, unknown>;
  visible: boolean;
}) => {
  const invalidate = useThree(({ invalidate: inv }) => inv);
  const prevSizeRef = useRef(thumbnailTextures.size);

  useEffect(() => {
    // Only invalidate when size grows (new textures arrived) and the graph is visible.
    if (thumbnailTextures.size > prevSizeRef.current && visible) {
      invalidate();
    }
    prevSizeRef.current = thumbnailTextures.size;
  }, [thumbnailTextures.size, invalidate, visible]);

  return null;
};
