/**
 * @file Graph-related React hook: useGraphLayoutState.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { buildGraphLayoutRevision, filterGraphLayoutTopologyRelationships } from "@treemich/shared";
import type { ImmichPerson, PhotoCluster, PhotoCooccurrenceEdge, RelationshipRecord } from "../../lib/api";
import {
  buildParentChildIndex,
  distanceSquared,
  positionPeople,
  subtractPosition,
  type GraphLayoutMode,
  type NodePosition
} from "./layout";
import { buildMergedParentGroups, buildVisibleRelationshipLines } from "./graphRelationshipLines";
import { relationshipFilterForType, type GraphFilterVisibility } from "./relationshipStyles";
import type { LayoutWorkerPayload } from "./layoutWorkerTypes";
import { shouldUseLayoutWorker, TOPOLOGY_LAYOUT_CACHE_MAX_ENTRIES } from "./graphLayoutConstants";
import { evictOldestMapEntriesToCap } from "./topologyLayoutCache";
import { useGraphLayoutWorker } from "./useGraphLayoutWorker";
import {
  computeCameraVisibility,
  type GraphVisibilityBucket,
  type GraphVisibilityThresholds
} from "./graphVisibility";
import { pickNearest } from "./pickNearest";

type UseGraphLayoutStateOptions = {
  people: ImmichPerson[];
  relationships: RelationshipRecord[];
  photoEdges: PhotoCooccurrenceEdge[];
  photoClusters: PhotoCluster[];
  viewMode: GraphLayoutMode;
  primaryFamilyUnitByPersonId?: Record<string, string>;
  showSingleFamilyTree?: boolean;
  singleFamilyTreeAnchorId?: string | null;
  filterVisibility: GraphFilterVisibility;
  selectedPersonId: string | null;
  hoveredPersonId: string | null;
  focusPersonId: string | null;
  pinnedPersonId: string | null;
  cameraPosition?: NodePosition;
  visibilityThresholds?: GraphVisibilityThresholds;
  serverPositionsByPersonId?: Record<string, NodePosition>;
  serverLayoutRevision?: string | null;
  serverLayoutAlgorithmVersion?: string | null;
  renderLimit: number;
};

const shouldMeasureGraphLayout =
  typeof window !== "undefined" && window.localStorage.getItem("treemich:profile-graph-layout") === "1";
const PROGRESSIVE_RENDER_BATCH_INTERVAL_MS = 150;
const MIN_CAMERA_CULLED_VISIBLE_COUNT = 180;

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

export { pickNearest } from "./pickNearest";

export const filterRelationshipsByLayer = (
  relationships: RelationshipRecord[],
  filterVisibility: GraphFilterVisibility
) =>
  relationships.filter((relationship) => {
    const filter = relationshipFilterForType(relationship.type);
    return filterVisibility[filter];
  });

const SERVER_LAYOUT_ALGORITHM_VERSION = "server-hybrid-v1";

const buildGraphRelationships = (
  relationships: RelationshipRecord[],
  filterVisibility: GraphFilterVisibility
) => {
  const filteredRelationships = filterRelationshipsByLayer(relationships, filterVisibility);
  const topologyRelationships = filterGraphLayoutTopologyRelationships(relationships);
  const { parentsByChild } = buildParentChildIndex(filteredRelationships);

  return {
    filteredRelationships,
    topologyRelationships,
    filteredParentsByChild: parentsByChild
  };
};

export const pickSingleFamilyTreeIds = (
  relationships: RelationshipRecord[],
  preferredPersonId: string | null
) => {
  const adjacency = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    const from = relationship.fromPersonId;
    const to = relationship.toPersonId;
    if (!adjacency.has(from)) {
      adjacency.set(from, new Set());
    }
    if (!adjacency.has(to)) {
      adjacency.set(to, new Set());
    }
    adjacency.get(from)?.add(to);
    adjacency.get(to)?.add(from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) {
      continue;
    }
    const queue = [startId];
    visited.add(startId);
    const component: string[] = [];
    let queueIndex = 0;
    while (queueIndex < queue.length) {
      const currentId = queue[queueIndex];
      queueIndex += 1;
      if (!currentId) {
        continue;
      }
      component.push(currentId);
      for (const nextId of adjacency.get(currentId) ?? []) {
        if (visited.has(nextId)) {
          continue;
        }
        visited.add(nextId);
        queue.push(nextId);
      }
    }
    components.push(component);
  }

  if (components.length === 0) {
    return preferredPersonId ? new Set([preferredPersonId]) : new Set<string>();
  }

  if (preferredPersonId) {
    const selectedComponent = components.find((component) => component.includes(preferredPersonId));
    if (selectedComponent) {
      return new Set(selectedComponent);
    }
    return new Set([preferredPersonId]);
  }

  const largestComponent = components.reduce((largest, current) =>
    current.length > largest.length ? current : largest
  );
  return new Set(largestComponent);
};

export const useGraphLayoutState = ({
  people,
  relationships,
  photoEdges,
  photoClusters,
  viewMode,
  primaryFamilyUnitByPersonId,
  filterVisibility,
  selectedPersonId,
  hoveredPersonId,
  focusPersonId,
  pinnedPersonId,
  cameraPosition,
  visibilityThresholds,
  serverPositionsByPersonId,
  serverLayoutRevision,
  serverLayoutAlgorithmVersion,
  renderLimit
}: UseGraphLayoutStateOptions) => {
  const baseRenderLimit = Math.max(1, renderLimit);
  const graphRelationships = useMemo(
    () => buildGraphRelationships(relationships, filterVisibility),
    [filterVisibility, relationships]
  );
  const filteredRelationships = graphRelationships.filteredRelationships;
  const topologyRelationships = graphRelationships.topologyRelationships;
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const topologyLayoutCacheRef = useRef(
    new Map<string, Array<{ personId: string; position: NodePosition }>>()
  );
  const lastStableLayoutSnapshotRef = useRef<Array<{ personId: string; position: NodePosition }> | null>(
    null
  );
  const shouldUseWorker = shouldUseLayoutWorker(viewMode, people.length);
  const topologyRevision = useMemo(
    () =>
      buildGraphLayoutRevision({
        people: people.map((person) => ({
          id: person.id,
          name: person.name
        })),
        relationships: topologyRelationships.map((relationship) => ({
          fromPersonId: relationship.fromPersonId,
          toPersonId: relationship.toPersonId,
          type: relationship.type
        })),
        viewMode,
        familyViewStyle: "generationTree",
        selectedPersonId,
        primaryFamilyUnitByPersonId
      }),
    [people, primaryFamilyUnitByPersonId, selectedPersonId, topologyRelationships, viewMode]
  );
  const hasCompleteServerCoverage = useMemo(() => {
    if (!serverPositionsByPersonId) {
      return false;
    }
    return people.every((person) => Boolean(serverPositionsByPersonId[person.id]));
  }, [people, serverPositionsByPersonId]);
  const shouldUseServerLayout =
    Boolean(serverPositionsByPersonId) &&
    hasCompleteServerCoverage &&
    serverLayoutAlgorithmVersion === SERVER_LAYOUT_ALGORITHM_VERSION &&
    serverLayoutRevision === topologyRevision;
  const serverPositionedPeople = useMemo(() => {
    if (!shouldUseServerLayout || !serverPositionsByPersonId) {
      return [];
    }
    return people
      .map((person) => {
        const position = serverPositionsByPersonId[person.id];
        return position ? { person, position } : null;
      })
      .filter((entry): entry is { person: ImmichPerson; position: NodePosition } => !!entry);
  }, [people, serverPositionsByPersonId, shouldUseServerLayout]);
  const [progressiveRenderLimit, setProgressiveRenderLimit] = useState(baseRenderLimit);
  const workerPayload = useMemo<LayoutWorkerPayload>(
    () => ({
      people,
      relationships: topologyRelationships,
      options: {
        mode: viewMode,
        photoClusters,
        primaryFamilyUnitByPersonId
      }
    }),
    [topologyRelationships, people, photoClusters, primaryFamilyUnitByPersonId, viewMode]
  );
  const { workerPositions, isWorkerFallbackEnabled } = useGraphLayoutWorker({
    shouldUseWorker,
    shouldUseServerLayout,
    workerPayload
  });

  const syncPositionedPeople = useMemo(() => {
    if (shouldUseServerLayout) {
      return [];
    }
    if (shouldUseWorker && !isWorkerFallbackEnabled) {
      return [];
    }
    const cached = topologyLayoutCacheRef.current.get(topologyRevision);
    if (cached) {
      return cached
        .map((entry) => {
          const person = peopleById.get(entry.personId);
          return person ? { person, position: entry.position } : null;
        })
        .filter((entry): entry is { person: ImmichPerson; position: NodePosition } => !!entry);
    }
    const positioned = measureGraphStep("positionPeople", () =>
      positionPeople(people, topologyRelationships, {
        mode: viewMode,
        photoClusters,
        primaryFamilyUnitByPersonId
      })
    );
    topologyLayoutCacheRef.current.set(
      topologyRevision,
      positioned.map((entry) => ({
        personId: entry.person.id,
        position: entry.position
      }))
    );
    evictOldestMapEntriesToCap(topologyLayoutCacheRef.current, TOPOLOGY_LAYOUT_CACHE_MAX_ENTRIES);
    return positioned;
  }, [
    isWorkerFallbackEnabled,
    topologyRevision,
    topologyRelationships,
    people,
    peopleById,
    photoClusters,
    primaryFamilyUnitByPersonId,
    shouldUseServerLayout,
    shouldUseWorker,
    viewMode
  ]);
  const computedPositionedPeople = useMemo(() => {
    if (shouldUseServerLayout) {
      return serverPositionedPeople;
    }
    if (!shouldUseWorker || isWorkerFallbackEnabled) {
      return syncPositionedPeople;
    }
    if (!workerPositions) {
      return [];
    }
    return workerPositions
      .map((entry) => {
        const person = peopleById.get(entry.personId);
        return person ? { person, position: entry.position } : null;
      })
      .filter((entry): entry is { person: ImmichPerson; position: NodePosition } => !!entry);
  }, [
    isWorkerFallbackEnabled,
    peopleById,
    serverPositionedPeople,
    shouldUseServerLayout,
    shouldUseWorker,
    syncPositionedPeople,
    workerPositions
  ]);
  useEffect(() => {
    if (computedPositionedPeople.length === 0) {
      return;
    }
    lastStableLayoutSnapshotRef.current = computedPositionedPeople.map((entry) => ({
      personId: entry.person.id,
      position: entry.position
    }));
  }, [computedPositionedPeople]);
  const positionedPeople = useMemo(() => {
    if (computedPositionedPeople.length > 0) {
      return computedPositionedPeople;
    }
    const showStaleWorkerLayout =
      shouldUseWorker && !shouldUseServerLayout && !isWorkerFallbackEnabled && workerPositions === null;
    if (!showStaleWorkerLayout) {
      return computedPositionedPeople;
    }
    const snapshot = lastStableLayoutSnapshotRef.current;
    if (!snapshot?.length) {
      return computedPositionedPeople;
    }
    return snapshot
      .map((entry) => {
        const person = peopleById.get(entry.personId);
        return person ? { person, position: entry.position } : null;
      })
      .filter((entry): entry is { person: ImmichPerson; position: NodePosition } => !!entry);
  }, [
    computedPositionedPeople,
    isWorkerFallbackEnabled,
    peopleById,
    shouldUseServerLayout,
    shouldUseWorker,
    workerPositions
  ]);
  const positionedById = useMemo(
    () => new Map(positionedPeople.map((item) => [item.person.id, item])),
    [positionedPeople]
  );

  const selectedPerson = useMemo(
    () => (selectedPersonId ? (peopleById.get(selectedPersonId) ?? null) : null),
    [peopleById, selectedPersonId]
  );
  const prioritizedNodeIds = useMemo(() => {
    return new Set(
      [selectedPersonId, hoveredPersonId, focusPersonId, pinnedPersonId].filter((value): value is string =>
        Boolean(value)
      )
    );
  }, [focusPersonId, hoveredPersonId, pinnedPersonId, selectedPersonId]);

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
  }, [
    baseRenderLimit,
    candidatePositionedPeople.length,
    viewMode,
    topologyRevision,
    shouldUseServerLayout,
    isWorkerFallbackEnabled,
    workerPositions
  ]);

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
        parentsByChild: graphRelationships.filteredParentsByChild,
        visibleIdSet: renderVisibleIdSet,
        primaryFamilyUnitByPersonId
      }),
    [graphRelationships.filteredParentsByChild, primaryFamilyUnitByPersonId, renderVisibleIdSet]
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

  const isWorkerLayoutPending = useMemo(
    () => shouldUseWorker && !shouldUseServerLayout && !isWorkerFallbackEnabled && workerPositions === null,
    [isWorkerFallbackEnabled, shouldUseServerLayout, shouldUseWorker, workerPositions]
  );

  return {
    filteredRelationships,
    peopleById,
    selectedPerson,
    prioritizedNodeIds,
    displayVisiblePeople,
    visiblePositionsById,
    graphBounds,
    visibleRelationshipLines: renderVisibleRelationshipLines,
    renderVisiblePeople,
    renderVisiblePositionsById,
    renderVisibleRelationshipLines,
    renderVisibilityBucketByPersonId: renderVisibilityState.bucketByPersonId,
    renderNearPersonIds,
    isWorkerLayoutPending
  };
};
