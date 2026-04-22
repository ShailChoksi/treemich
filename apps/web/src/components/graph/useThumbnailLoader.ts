/**
 * @file Graph-related React hook: useThumbnailLoader.
 */

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { SRGBColorSpace, Texture } from "three";
import type { Vector3 } from "three";
import { personThumbnailUrl } from "../../lib/api";
import { loadThumbnailBatch } from "./thumbnailWorkerClient";
import type { NodePosition } from "./layout";
import { distanceSquared } from "./layout";

const CAMERA_THUMBNAIL_BATCH = 10;
const THUMBNAIL_BATCH_SIZE = 5;
const THUMBNAIL_BATCH_INTERVAL_MS = 750;
const CAMERA_SAMPLE_INTERVAL_MS = 140;
const THUMBNAIL_BACKOFF_BASE_MS = 1000;
const THUMBNAIL_BACKOFF_MAX_MS = 4000;

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
    if (!id || loadedIds.has(id) || inFlightIds.has(id)) {
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

export const useThumbnailLoader = ({
  peopleIds,
  prioritizedNodeIds,
  renderNearPersonIds,
  displayVisiblePeople,
  cameraSampleRef
}: {
  peopleIds: string[];
  prioritizedNodeIds: Set<string>;
  renderNearPersonIds: string[];
  displayVisiblePeople: PositionedPerson[];
  cameraSampleRef: MutableRefObject<Vector3>;
}) => {
  const [thumbnailTextures, setThumbnailTextures] = useState<Map<string, Texture>>(() => new Map());
  const [nearCameraNodeIds, setNearCameraNodeIds] = useState<string[]>([]);
  const [backoffUntilMs, setBackoffUntilMs] = useState(0);
  const inFlightIdsRef = useRef(new Set<string>());
  const isDrainActiveRef = useRef(false);
  const failureStreakRef = useRef(0);

  useEffect(() => {
    if (displayVisiblePeople.length === 0) {
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
  }, [cameraSampleRef, displayVisiblePeople]);

  const visibleIdsByDistance = useMemo(() => {
    // Keep progressive thumbnail loading stable for the currently visible set.
    // Camera-driven reprioritization already happens through nearCameraNodeIds.
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
        if (!existingPeopleIds.has(id)) {
          texture.dispose();
          changed = true;
          continue;
        }
        next.set(id, texture);
      }
      return changed ? next : current;
    });
  }, [peopleIds]);

  useEffect(() => {
    if (thumbnailLoadOrder.length === 0) {
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
        loadedIds: new Set(thumbnailTextures.keys()),
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
          url: personThumbnailUrl(personId)
        }));
        const results = await loadThumbnailBatch(items);

        if (!isDisposed) {
          const newTextures: Array<[string, Texture]> = [];
          let hasFailure = false;

          for (const result of results) {
            if (result.status === "fulfilled") {
              newTextures.push([result.personId, createTextureFromBitmap(result.bitmap)]);
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
  }, [backoffUntilMs, thumbnailTextures, thumbnailLoadOrder]);

  const thumbnailNodeIds = useMemo(() => new Set(thumbnailTextures.keys()), [thumbnailTextures]);

  return {
    thumbnailNodeIds,
    thumbnailTextures
  };
};
