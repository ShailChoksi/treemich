/**
 * @file Visibility, progressive rendering, and visible edge construction for the graph.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Person, PhotoCooccurrenceEdge, RelationshipRecord } from "../../lib/api";
import { getLocalStorageItem } from "../../lib/safeLocalStorage";
import {
  computeCameraVisibility,
  type GraphVisibilityBucket,
  type GraphVisibilityThresholds
} from "./graphVisibility";
import { buildMergedParentGroups, buildVisibleRelationshipLines } from "./graphRelationshipLines";
import { distanceSquared, subtractPosition, type GraphLayoutMode, type NodePosition } from "./layout";
import { pickNearest } from "./pickNearest";
import type { PositionedPerson } from "./useLayoutOrchestrator";

const PROGRESSIVE_RENDER_BATCH_INTERVAL_MS = 150;
const MIN_CAMERA_CULLED_VISIBLE_COUNT = 180;

const shouldMeasureGraphLayout =
  typeof window !== "undefined" && getLocalStorageItem("treemich:profile-graph-layout") === "1";

const measureGraphStep = <T>(label: string, factory: () => T): T => {
  if (!shouldMeasureGraphLayout) {
    return factory();
  }
  const startMs = performance.now();
  const result = factory();
  const durationMs = performance.now() - startMs;
  console.debug(`[graph-layout-profiler] ${label}: ${durationMs.toFixed(1)}ms`);
  return result;
};

type UseGraphVisibilityOptions = {
  positionedPeople: PositionedPerson[];
  positionedById: Map<string, PositionedPerson>;
  filteredRelationships: RelationshipRecord[];
  filteredParentsByChild: Map<string, Set<string>>;
  photoEdges: PhotoCooccurrenceEdge[];
  viewMode: GraphLayoutMode;
  primaryFamilyUnitByPersonId?: Record<string, string>;
  selectedPersonId: string | null;
  hoveredPersonId: string | null;
  focusPersonId: string | null;
  pinnedPersonId: string | null;
  cameraPosition?: NodePosition;
  visibilityThresholds?: GraphVisibilityThresholds;
  renderLimit: number;
  topologyRevision: string;
  prioritizedNodeIds: Set<string>;
};

export const useGraphVisibility = ({
  positionedPeople,
  positionedById,
  filteredRelationships,
  filteredParentsByChild,
  photoEdges,
  viewMode,
  primaryFamilyUnitByPersonId,
  selectedPersonId,
  focusPersonId,
  pinnedPersonId,
  cameraPosition,
  visibilityThresholds,
  renderLimit,
  topologyRevision,
  prioritizedNodeIds
}: UseGraphVisibilityOptions) => {
  const baseRenderLimit = Math.max(1, renderLimit);
  const [progressiveRenderLimit, setProgressiveRenderLimit] = useState(baseRenderLimit);
  const focusPosition = useMemo<NodePosition>(() => {
    const focused = focusPersonId ? positionedById.get(focusPersonId) : undefined;
    return focused?.position ?? [0, 0, 0];
  }, [focusPersonId, positionedById]);

  const candidatePositionedPeople = useMemo(() => positionedPeople, [positionedPeople]);
  const effectiveRenderLimit = useMemo(
    () => Math.min(progressiveRenderLimit, candidatePositionedPeople.length),
    [candidatePositionedPeople.length, progressiveRenderLimit]
  );

  useEffect(() => {
    setProgressiveRenderLimit(baseRenderLimit);
  }, [baseRenderLimit, candidatePositionedPeople.length, topologyRevision, viewMode]);

  useEffect(() => {
    if (candidatePositionedPeople.length <= progressiveRenderLimit) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setProgressiveRenderLimit((current) => {
        const nextLimit = current + baseRenderLimit;
        return Math.min(nextLimit, candidatePositionedPeople.length);
      });
    }, PROGRESSIVE_RENDER_BATCH_INTERVAL_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [baseRenderLimit, candidatePositionedPeople.length, progressiveRenderLimit]);

  const visiblePeople = useMemo(() => {
    const ensurePinnedVisible = (items: typeof positionedPeople) => {
      const ensurePresence = (nextItems: typeof positionedPeople, personId: string | null) => {
        if (!personId) {
          return nextItems;
        }
        const alreadyVisible = nextItems.some((item) => item.person.id === personId);
        if (alreadyVisible) {
          return nextItems;
        }
        const item = positionedById.get(personId);
        if (!item) {
          return nextItems;
        }
        if (nextItems.length === 0) {
          return [item];
        }
        return [item, ...nextItems.slice(0, Math.max(nextItems.length - 1, 0))];
      };

      let nextItems = items;
      nextItems = ensurePresence(nextItems, selectedPersonId);
      nextItems = ensurePresence(nextItems, focusPersonId);
      if (!pinnedPersonId) {
        return nextItems;
      }
      const alreadyVisible = nextItems.some((item) => item.person.id === pinnedPersonId);
      if (alreadyVisible) {
        return nextItems;
      }
      const pinnedItem = positionedById.get(pinnedPersonId);
      if (!pinnedItem) {
        return nextItems;
      }
      if (nextItems.length === 0) {
        return [pinnedItem];
      }
      return [pinnedItem, ...nextItems.slice(0, Math.max(nextItems.length - 1, 0))];
    };

    if (candidatePositionedPeople.length <= effectiveRenderLimit) {
      return ensurePinnedVisible(candidatePositionedPeople);
    }

    if (!focusPersonId) {
      return ensurePinnedVisible(candidatePositionedPeople.slice(0, effectiveRenderLimit));
    }

    const focused = positionedById.get(focusPersonId);
    if (!focused) {
      return ensurePinnedVisible(candidatePositionedPeople.slice(0, effectiveRenderLimit));
    }

    const subset = pickNearest(candidatePositionedPeople, focused.position, effectiveRenderLimit);
    return ensurePinnedVisible(subset);
  }, [
    candidatePositionedPeople,
    effectiveRenderLimit,
    focusPersonId,
    pinnedPersonId,
    positionedById,
    selectedPersonId
  ]);
  const displayVisiblePeople = useMemo(() => {
    const baseItems = visiblePeople.map((item) => ({
      person: item.person,
      displayPosition: subtractPosition(item.position, focusPosition)
    }));

    if (!pinnedPersonId) {
      return baseItems;
    }

    const pinnedIndex = baseItems.findIndex((item) => item.person.id === pinnedPersonId);
    if (pinnedIndex < 0) {
      return baseItems;
    }

    const otherPositions = baseItems
      .filter((_, index) => index !== pinnedIndex)
      .map((item) => item.displayPosition);

    const minGap = 1.7;
    const minGapSquared = minGap * minGap;
    const candidateOffsets: NodePosition[] = [
      [0, 0, 0],
      [1.9, 0, 0],
      [-1.9, 0, 0],
      [0, 1.6, 0],
      [0, -1.6, 0],
      [2.8, 1.2, 0],
      [-2.8, 1.2, 0],
      [2.8, -1.2, 0],
      [-2.8, -1.2, 0],
      [0, 0, -1.8],
      [2.2, 0, -1.8],
      [-2.2, 0, -1.8]
    ];

    const isOpenSlot = (candidate: NodePosition) =>
      otherPositions.every((position) => distanceSquared(candidate, position) >= minGapSquared);

    const openSlot = candidateOffsets.find(isOpenSlot) ?? ([0, 0, 0] as NodePosition);
    const pinnedItem = baseItems[pinnedIndex];
    if (!pinnedItem) {
      return baseItems;
    }
    baseItems[pinnedIndex] = {
      person: pinnedItem.person,
      displayPosition: openSlot
    };

    return baseItems;
  }, [focusPosition, pinnedPersonId, visiblePeople]);
  const visiblePositionsById = useMemo(
    () => new Map(displayVisiblePeople.map((item) => [item.person.id, item.displayPosition])),
    [displayVisiblePeople]
  );
  const graphBounds = useMemo(() => {
    if (displayVisiblePeople.length === 0) {
      return null;
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const { displayPosition } of displayVisiblePeople) {
      minX = Math.min(minX, displayPosition[0]);
      minY = Math.min(minY, displayPosition[1]);
      minZ = Math.min(minZ, displayPosition[2]);
      maxX = Math.max(maxX, displayPosition[0]);
      maxY = Math.max(maxY, displayPosition[1]);
      maxZ = Math.max(maxZ, displayPosition[2]);
    }

    return {
      min: [minX, minY, minZ] as NodePosition,
      max: [maxX, maxY, maxZ] as NodePosition
    };
  }, [displayVisiblePeople]);
  const cameraPositionForVisibility = cameraPosition ?? ([0, 2, 18] as NodePosition);
  const previousVisibilityBucketsRef = useRef(new Map<string, GraphVisibilityBucket>());
  const renderVisibilityState = useMemo(
    () =>
      computeCameraVisibility({
        displayPeople: displayVisiblePeople.map((item) => ({
          personId: item.person.id,
          displayPosition: item.displayPosition
        })),
        cameraPosition: cameraPositionForVisibility,
        prioritizedNodeIds,
        previousBuckets: previousVisibilityBucketsRef.current,
        thresholds: visibilityThresholds,
        minVisibleCount: MIN_CAMERA_CULLED_VISIBLE_COUNT
      }),
    [cameraPositionForVisibility, displayVisiblePeople, prioritizedNodeIds, visibilityThresholds]
  );
  useEffect(() => {
    previousVisibilityBucketsRef.current = renderVisibilityState.bucketByPersonId;
  }, [renderVisibilityState.bucketByPersonId]);
  const renderVisiblePeople = useMemo(
    () => displayVisiblePeople.filter((item) => renderVisibilityState.renderVisibleIdSet.has(item.person.id)),
    [displayVisiblePeople, renderVisibilityState.renderVisibleIdSet]
  );
  const renderVisiblePositionsById = useMemo(
    () => new Map(renderVisiblePeople.map((item) => [item.person.id, item.displayPosition])),
    [renderVisiblePeople]
  );
  const renderVisibleIdSet = useMemo(
    () => new Set(renderVisiblePeople.map((item) => item.person.id)),
    [renderVisiblePeople]
  );
  const renderMergedParentGroups = useMemo(
    () =>
      buildMergedParentGroups({
        parentsByChild: filteredParentsByChild,
        visibleIdSet: renderVisibleIdSet,
        primaryFamilyUnitByPersonId
      }),
    [filteredParentsByChild, primaryFamilyUnitByPersonId, renderVisibleIdSet]
  );
  const renderVisibleRelationshipLines = useMemo(
    () =>
      measureGraphStep("visibleRelationshipLines", () =>
        buildVisibleRelationshipLines({
          viewMode,
          photoEdges,
          visiblePositionsById: renderVisiblePositionsById,
          mergedParentGroups: renderMergedParentGroups,
          filteredRelationships,
          visibleIdSet: renderVisibleIdSet
        })
      ),
    [
      filteredRelationships,
      photoEdges,
      renderMergedParentGroups,
      renderVisibleIdSet,
      renderVisiblePositionsById,
      viewMode
    ]
  );
  const renderNearPersonIds = useMemo(
    () =>
      renderVisiblePeople
        .map((item) => item.person.id)
        .filter((personId) => renderVisibilityState.bucketByPersonId.get(personId) === "near"),
    [renderVisibilityState.bucketByPersonId, renderVisiblePeople]
  );

  return {
    displayVisiblePeople,
    graphBounds,
    renderNearPersonIds,
    renderVisibilityBucketByPersonId: renderVisibilityState.bucketByPersonId,
    renderVisiblePeople,
    renderVisiblePositionsById,
    renderVisibleRelationshipLines,
    visiblePositionsById
  };
};
