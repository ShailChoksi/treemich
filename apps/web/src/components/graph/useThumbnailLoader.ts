import { useEffect, useMemo, useState } from "react";
import type { NodePosition } from "./layout";
import { distanceSquared } from "./layout";

const INITIAL_THUMBNAIL_BATCH = 12;
const CAMERA_THUMBNAIL_BATCH = 10;
const PROGRESSIVE_CHUNK_SIZE = 16;
const PROGRESSIVE_INTERVAL_MS = 120;

type PositionedPerson = {
  person: { id: string };
  displayPosition: NodePosition;
};

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
  displayVisiblePeople,
  cameraPosition
}: {
  peopleIds: string[];
  prioritizedNodeIds: Set<string>;
  displayVisiblePeople: PositionedPerson[];
  cameraPosition: NodePosition;
}) => {
  const [loadedThumbnailIds, setLoadedThumbnailIds] = useState<Set<string>>(() => new Set());

  const nearCameraNodeIds = useMemo(() => {
    return pickNearestIds(displayVisiblePeople, cameraPosition, CAMERA_THUMBNAIL_BATCH);
  }, [cameraPosition, displayVisiblePeople]);
  const visibleIdsByDistance = useMemo(() => {
    // Keep progressive thumbnail loading stable for the currently visible set.
    // Camera-driven reprioritization already happens through nearCameraNodeIds.
    return displayVisiblePeople.map((item) => item.person.id);
  }, [displayVisiblePeople]);

  useEffect(() => {
    const idsToPersist = [...prioritizedNodeIds, ...nearCameraNodeIds];
    if (idsToPersist.length === 0) {
      return;
    }

    setLoadedThumbnailIds((current) => {
      let changed = false;
      const next = new Set(current);
      for (const id of idsToPersist) {
        if (next.has(id)) {
          continue;
        }
        next.add(id);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [nearCameraNodeIds, prioritizedNodeIds]);

  useEffect(() => {
    const existingPeopleIds = new Set(peopleIds);
    setLoadedThumbnailIds((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of current) {
        if (!existingPeopleIds.has(id)) {
          changed = true;
          continue;
        }
        next.add(id);
      }
      return changed ? next : current;
    });
  }, [peopleIds]);

  useEffect(() => {
    if (visibleIdsByDistance.length === 0) {
      return;
    }

    let cursor = 0;
    const loadChunk = () => {
      setLoadedThumbnailIds((current) => {
        const next = new Set(current);
        let loadedInChunk = 0;

        while (cursor < visibleIdsByDistance.length && loadedInChunk < PROGRESSIVE_CHUNK_SIZE) {
          const id = visibleIdsByDistance[cursor];
          cursor += 1;
          if (!id || next.has(id)) {
            continue;
          }
          next.add(id);
          loadedInChunk += 1;
        }

        return next.size === current.size ? current : next;
      });
    };

    // Load first chunk immediately, then continue progressively.
    loadChunk();
    const interval = window.setInterval(() => {
      if (cursor >= visibleIdsByDistance.length) {
        window.clearInterval(interval);
        return;
      }
      loadChunk();
    }, PROGRESSIVE_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [visibleIdsByDistance]);

  const thumbnailNodeIds = useMemo(() => {
    const ids = new Set<string>(loadedThumbnailIds);
    for (const id of prioritizedNodeIds) {
      ids.add(id);
    }
    for (const id of nearCameraNodeIds) {
      ids.add(id);
    }
    if (ids.size < INITIAL_THUMBNAIL_BATCH) {
      for (const { person } of displayVisiblePeople) {
        if (ids.size >= INITIAL_THUMBNAIL_BATCH) {
          break;
        }
        ids.add(person.id);
      }
    }
    return ids;
  }, [displayVisiblePeople, loadedThumbnailIds, nearCameraNodeIds, prioritizedNodeIds]);

  return {
    thumbnailNodeIds
  };
};
