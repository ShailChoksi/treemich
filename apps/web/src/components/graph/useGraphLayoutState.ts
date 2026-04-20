import { useEffect, useMemo, useRef, useState } from "react";
import { buildGraphLayoutRevision } from "@treemich/shared";
import type { ImmichPerson, PhotoCluster, PhotoCooccurrenceEdge, RelationshipRecord } from "../../lib/api";
import {
  buildParentChildIndex,
  defaultFamilyViewStyle,
  distanceSquared,
  positionPeople,
  subtractPosition,
  type FamilyViewStyle,
  type GraphLayoutMode,
  type NodePosition
} from "./layout";
import {
  relationshipKindForType,
  relationshipFilterForType,
  type GraphFilterVisibility,
  type RelationshipKind
} from "./relationshipStyles";
import { requestPositionPeopleInWorker } from "./layoutWorkerClient";
import type { LayoutWorkerPayload } from "./layoutWorkerTypes";
import {
  computeCameraVisibility,
  type GraphVisibilityBucket,
  type GraphVisibilityThresholds
} from "./graphVisibility";

type UseGraphLayoutStateOptions = {
  people: ImmichPerson[];
  relationships: RelationshipRecord[];
  photoEdges: PhotoCooccurrenceEdge[];
  photoClusters: PhotoCluster[];
  viewMode: GraphLayoutMode;
  familyViewStyle?: FamilyViewStyle;
  graphLineRoutingStyle?: "orthogonal" | "direct";
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
const LAYOUT_WORKER_MIN_PEOPLE = 320;

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

export const resolveSelectedPersonForLayout = (
  activeFamilyViewStyle: FamilyViewStyle,
  selectedPersonId: string | null
) =>
  activeFamilyViewStyle === "centeredRelationshipMap" || activeFamilyViewStyle === "hybridTreeList"
    ? selectedPersonId
    : null;

const pairKey = (firstId: string, secondId: string) =>
  firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`;

const candidateParentPairKeys = (parentIds: string[]) => {
  const sorted = [...new Set(parentIds)].sort();
  if (sorted.length <= 1) {
    return sorted.length === 1 ? [sorted[0] as string] : [];
  }
  if (sorted.length === 2) {
    return [pairKey(sorted[0] as string, sorted[1] as string)];
  }
  const keys: string[] = [];
  for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
    const firstId = sorted[firstIndex];
    if (!firstId) {
      continue;
    }
    for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
      const secondId = sorted[secondIndex];
      if (!secondId) {
        continue;
      }
      keys.push(pairKey(firstId, secondId));
    }
  }
  return keys;
};

export const pickNearest = (
  items: Array<{ person: ImmichPerson; position: NodePosition }>,
  origin: NodePosition,
  limit: number
) => {
  if (items.length <= limit) {
    return items;
  }

  const nearest: Array<{ item: { person: ImmichPerson; position: NodePosition }; distance: number }> = [];
  for (const item of items) {
    const candidate = {
      item,
      distance: distanceSquared(item.position, origin)
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

  return nearest.map((entry) => entry.item);
};

export const filterRelationshipsByLayer = (
  relationships: RelationshipRecord[],
  filterVisibility: GraphFilterVisibility
) =>
  relationships.filter((relationship) => {
    const filter = relationshipFilterForType(relationship.type);
    return filterVisibility[filter];
  });

const relationshipsForTreeTopology = (relationships: RelationshipRecord[]) =>
  relationships.filter(
    (relationship) =>
      relationship.type === "PARENT_OF" ||
      relationship.type === "CHILD_OF" ||
      relationship.type === "SPOUSE_OF"
  );

const shouldUseLayoutWorker = (viewMode: GraphLayoutMode, peopleCount: number) =>
  viewMode === "family" && peopleCount >= LAYOUT_WORKER_MIN_PEOPLE && typeof Worker !== "undefined";
const SERVER_LAYOUT_ALGORITHM_VERSION = "server-hybrid-v1";

const buildGraphRelationships = (
  relationships: RelationshipRecord[],
  filterVisibility: GraphFilterVisibility
) => {
  const filteredRelationships = filterRelationshipsByLayer(relationships, filterVisibility);
  const topologyRelationships = relationshipsForTreeTopology(relationships);
  const { parentsByChild } = buildParentChildIndex(filteredRelationships);

  return {
    filteredRelationships,
    topologyRelationships,
    filteredParentsByChild: parentsByChild
  };
};

const TOPOLOGY_LAYOUT_CACHE_MAX_ENTRIES = 8;

const serializePrimaryFamilyUnits = (primaryFamilyUnitByPersonId?: Record<string, string>) => {
  if (!primaryFamilyUnitByPersonId) {
    return "";
  }
  return Object.entries(primaryFamilyUnitByPersonId)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([personId, unitKey]) => `${personId}:${unitKey}`)
    .join(",");
};

const buildTopologyCacheKey = ({
  people,
  topologyRelationships,
  viewMode,
  familyViewStyle,
  selectedPersonForLayout,
  primaryFamilyUnitByPersonId
}: {
  people: ImmichPerson[];
  topologyRelationships: RelationshipRecord[];
  viewMode: GraphLayoutMode;
  familyViewStyle: FamilyViewStyle;
  selectedPersonForLayout: string | null;
  primaryFamilyUnitByPersonId?: Record<string, string>;
}) =>
  [
    `mode=${viewMode}`,
    `style=${familyViewStyle}`,
    `selected=${selectedPersonForLayout ?? ""}`,
    `people=${people.map((person) => person.id).join(",")}`,
    `relationships=${topologyRelationships
      .map((relationship) => `${relationship.fromPersonId}|${relationship.type}|${relationship.toPersonId}`)
      .join(",")}`,
    `primary=${serializePrimaryFamilyUnits(primaryFamilyUnitByPersonId)}`
  ].join("||");

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

export const routeRelationshipSegment = (
  from: NodePosition,
  to: NodePosition,
  kind: RelationshipKind,
  familyViewStyle?: FamilyViewStyle,
  graphLineRoutingStyle: "orthogonal" | "direct" = "orthogonal"
) => {
  void kind;
  void familyViewStyle;
  void graphLineRoutingStyle;
  return [from, to] as NodePosition[];
};

type GraphLine = {
  key: string;
  points: NodePosition[];
  kind: RelationshipKind;
  opacity?: number;
};

const buildMergedParentGroups = ({
  parentsByChild,
  visibleIdSet,
  primaryFamilyUnitByPersonId
}: {
  parentsByChild: Map<string, Set<string>>;
  visibleIdSet: Set<string>;
  primaryFamilyUnitByPersonId?: Record<string, string>;
}) => {
  const groups = new Map<string, { parentAId: string; parentBId: string; childIds: Set<string> }>();
  for (const [childId, parentSet] of parentsByChild.entries()) {
    if (!visibleIdSet.has(childId)) {
      continue;
    }
    if (parentSet.size < 2) {
      continue;
    }
    const parentIds = [...parentSet];
    const candidates = candidateParentPairKeys(parentIds);
    if (candidates.length === 0) {
      continue;
    }
    const preferred = primaryFamilyUnitByPersonId?.[childId];
    const selectedPairKey =
      preferred && candidates.includes(preferred) ? preferred : (candidates[0] as string);
    const [parentAId, parentBId] = selectedPairKey.split("|");
    if (!parentAId || !parentBId) {
      continue;
    }
    if (!visibleIdSet.has(parentAId) || !visibleIdSet.has(parentBId)) {
      continue;
    }
    const key = pairKey(parentAId, parentBId);
    const existing = groups.get(key);
    if (existing) {
      existing.childIds.add(childId);
    } else {
      groups.set(key, {
        parentAId,
        parentBId,
        childIds: new Set([childId])
      });
    }
  }
  return groups;
};

const buildVisibleRelationshipLines = ({
  viewMode,
  photoEdges,
  visiblePositionsById,
  mergedParentGroups,
  filteredRelationships,
  visibleIdSet,
  familyViewStyle,
  graphLineRoutingStyle
}: {
  viewMode: GraphLayoutMode;
  photoEdges: PhotoCooccurrenceEdge[];
  visiblePositionsById: Map<string, NodePosition>;
  mergedParentGroups: Map<string, { parentAId: string; parentBId: string; childIds: Set<string> }>;
  filteredRelationships: RelationshipRecord[];
  visibleIdSet: Set<string>;
  familyViewStyle?: FamilyViewStyle;
  graphLineRoutingStyle: "orthogonal" | "direct";
}) => {
  if (viewMode === "photo") {
    const lines: GraphLine[] = [];
    for (const edge of photoEdges) {
      const from = visiblePositionsById.get(edge.personAId);
      const to = visiblePositionsById.get(edge.personBId);
      if (!from || !to) {
        continue;
      }
      lines.push({
        key: `photo:${edge.personAId}|${edge.personBId}`,
        points: [from, to],
        kind: "CO_OCCURRENCE",
        opacity: Math.min(0.95, Math.max(0.2, 0.2 + edge.score * 0.75))
      });
    }
    return lines;
  }

  const resolvedParentChildPairs = new Set<string>();
  const seen = new Set<string>();
  const lines: GraphLine[] = [];
  for (const [parentPairKey, group] of mergedParentGroups.entries()) {
    const parentA = visiblePositionsById.get(group.parentAId);
    const parentB = visiblePositionsById.get(group.parentBId);
    if (!parentA || !parentB) {
      continue;
    }

    const childPositions: Array<{ childId: string; position: NodePosition }> = [];
    for (const childId of group.childIds) {
      const position = visiblePositionsById.get(childId);
      if (!position) {
        continue;
      }
      childPositions.push({ childId, position });
    }
    if (childPositions.length === 0) {
      continue;
    }
    if (childPositions.length > 1) {
      childPositions.sort((left, right) => left.position[0] - right.position[0]);
    }

    for (const { childId } of childPositions) {
      resolvedParentChildPairs.add(`${group.parentAId}|${childId}`);
      resolvedParentChildPairs.add(`${group.parentBId}|${childId}`);
    }

    const parentMid: NodePosition = [
      (parentA[0] + parentB[0]) / 2,
      (parentA[1] + parentB[1]) / 2,
      (parentA[2] + parentB[2]) / 2
    ];
    let centroidX = 0;
    let centroidY = 0;
    let centroidZ = 0;
    for (const child of childPositions) {
      centroidX += child.position[0];
      centroidY += child.position[1];
      centroidZ += child.position[2];
    }
    const centroid: NodePosition = [
      centroidX / childPositions.length,
      centroidY / childPositions.length,
      centroidZ / childPositions.length
    ];
    const forkBase: NodePosition = [
      parentMid[0] * 0.5 + centroid[0] * 0.5,
      parentMid[1] * 0.5 + centroid[1] * 0.5,
      parentMid[2] * 0.5 + centroid[2] * 0.5
    ];

    lines.push({
      key: `family:merge:${parentPairKey}:a`,
      points: routeRelationshipSegment(
        parentA,
        parentMid,
        "PARENT_CHILD",
        familyViewStyle,
        graphLineRoutingStyle
      ),
      kind: "PARENT_CHILD"
    });
    lines.push({
      key: `family:merge:${parentPairKey}:b`,
      points: routeRelationshipSegment(
        parentB,
        parentMid,
        "PARENT_CHILD",
        familyViewStyle,
        graphLineRoutingStyle
      ),
      kind: "PARENT_CHILD"
    });

    if (childPositions.length > 1) {
      lines.push({
        key: `family:merge:${parentPairKey}:trunk`,
        points: routeRelationshipSegment(
          parentMid,
          forkBase,
          "PARENT_CHILD",
          familyViewStyle,
          graphLineRoutingStyle
        ),
        kind: "PARENT_CHILD"
      });
    }

    const branchRoot = childPositions.length > 1 ? forkBase : parentMid;
    for (const { childId, position } of childPositions) {
      lines.push({
        key: `family:merge:${parentPairKey}:child:${childId}`,
        points: routeRelationshipSegment(
          branchRoot,
          position,
          "PARENT_CHILD",
          familyViewStyle,
          graphLineRoutingStyle
        ),
        kind: "PARENT_CHILD"
      });
    }
  }

  for (const relationship of filteredRelationships) {
    const first = relationship.fromPersonId;
    const second = relationship.toPersonId;
    if (!visibleIdSet.has(first) || !visibleIdSet.has(second)) {
      continue;
    }
    const canonicalPair = pairKey(first, second);
    const kind = relationshipKindForType(relationship.type);
    if (
      kind === "PARENT_CHILD" &&
      (resolvedParentChildPairs.has(`${first}|${second}`) ||
        resolvedParentChildPairs.has(`${second}|${first}`))
    ) {
      continue;
    }
    const key = `${canonicalPair}:${kind}`;
    if (seen.has(key)) {
      continue;
    }
    const from = visiblePositionsById.get(first);
    const to = visiblePositionsById.get(second);
    if (!from || !to) {
      continue;
    }
    seen.add(key);
    lines.push({
      key,
      points: routeRelationshipSegment(from, to, kind, familyViewStyle, graphLineRoutingStyle),
      kind
    });
  }

  return lines;
};

export const useGraphLayoutState = ({
  people,
  relationships,
  photoEdges,
  photoClusters,
  viewMode,
  familyViewStyle,
  graphLineRoutingStyle,
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
  const activeFamilyViewStyle = familyViewStyle ?? defaultFamilyViewStyle;
  const selectedPersonForLayout = resolveSelectedPersonForLayout(activeFamilyViewStyle, selectedPersonId);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const topologyLayoutCacheRef = useRef(
    new Map<string, Array<{ personId: string; position: NodePosition }>>()
  );
  const topologyCacheKey = useMemo(
    () =>
      buildTopologyCacheKey({
        people,
        topologyRelationships,
        viewMode,
        familyViewStyle: activeFamilyViewStyle,
        selectedPersonForLayout,
        primaryFamilyUnitByPersonId
      }),
    [
      activeFamilyViewStyle,
      people,
      primaryFamilyUnitByPersonId,
      selectedPersonForLayout,
      topologyRelationships,
      viewMode
    ]
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
        familyViewStyle: activeFamilyViewStyle,
        selectedPersonId: selectedPersonForLayout,
        primaryFamilyUnitByPersonId
      }),
    [
      activeFamilyViewStyle,
      people,
      primaryFamilyUnitByPersonId,
      selectedPersonForLayout,
      topologyRelationships,
      viewMode
    ]
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
  const hasLoggedWorkerFailureRef = useRef(false);
  const workerRequestIdRef = useRef(0);
  const [workerPositions, setWorkerPositions] = useState<Array<{
    personId: string;
    position: NodePosition;
  }> | null>(null);
  const [isWorkerFallbackEnabled, setIsWorkerFallbackEnabled] = useState(false);
  const [progressiveRenderLimit, setProgressiveRenderLimit] = useState(baseRenderLimit);
  const workerPayload = useMemo<LayoutWorkerPayload>(
    () => ({
      people,
      relationships: topologyRelationships,
      options: {
        mode: viewMode,
        photoClusters,
        familyViewStyle: activeFamilyViewStyle,
        selectedPersonId: selectedPersonForLayout,
        primaryFamilyUnitByPersonId
      }
    }),
    [
      activeFamilyViewStyle,
      topologyRelationships,
      people,
      photoClusters,
      primaryFamilyUnitByPersonId,
      selectedPersonForLayout,
      viewMode
    ]
  );

  useEffect(() => {
    if (!shouldUseWorker || isWorkerFallbackEnabled || shouldUseServerLayout) {
      workerRequestIdRef.current += 1;
      setWorkerPositions(null);
      return;
    }
    const requestId = workerRequestIdRef.current + 1;
    workerRequestIdRef.current = requestId;
    setWorkerPositions(null);
    let isDisposed = false;
    void requestPositionPeopleInWorker(workerPayload)
      .then((positions) => {
        if (isDisposed || workerRequestIdRef.current !== requestId) {
          return;
        }
        setWorkerPositions(positions);
      })
      .catch((error) => {
        if (isDisposed || workerRequestIdRef.current !== requestId) {
          return;
        }
        if (!hasLoggedWorkerFailureRef.current) {
          hasLoggedWorkerFailureRef.current = true;
          console.warn("[graph-layout] falling back to sync layout after worker failure", error);
        }
        setIsWorkerFallbackEnabled(true);
        setWorkerPositions(null);
      });
    return () => {
      isDisposed = true;
    };
  }, [isWorkerFallbackEnabled, shouldUseServerLayout, shouldUseWorker, workerPayload]);

  useEffect(() => {
    if (!shouldUseWorker) {
      setIsWorkerFallbackEnabled(false);
      hasLoggedWorkerFailureRef.current = false;
    }
  }, [shouldUseWorker]);

  const syncPositionedPeople = useMemo(() => {
    if (shouldUseServerLayout) {
      return [];
    }
    if (shouldUseWorker && !isWorkerFallbackEnabled) {
      return [];
    }
    const cached = topologyLayoutCacheRef.current.get(topologyCacheKey);
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
        familyViewStyle: activeFamilyViewStyle,
        selectedPersonId: selectedPersonForLayout,
        primaryFamilyUnitByPersonId
      })
    );
    topologyLayoutCacheRef.current.set(
      topologyCacheKey,
      positioned.map((entry) => ({
        personId: entry.person.id,
        position: entry.position
      }))
    );
    while (topologyLayoutCacheRef.current.size > TOPOLOGY_LAYOUT_CACHE_MAX_ENTRIES) {
      const firstKey = topologyLayoutCacheRef.current.keys().next().value;
      if (!firstKey) {
        break;
      }
      topologyLayoutCacheRef.current.delete(firstKey);
    }
    return positioned;
  }, [
    activeFamilyViewStyle,
    isWorkerFallbackEnabled,
    topologyCacheKey,
    topologyRelationships,
    people,
    peopleById,
    photoClusters,
    primaryFamilyUnitByPersonId,
    selectedPersonForLayout,
    shouldUseServerLayout,
    shouldUseWorker,
    viewMode
  ]);
  const positionedPeople = useMemo(() => {
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

  const candidatePositionedPeople = useMemo(() => {
    // Keep all named faces visible across view styles, including isolated components.
    return positionedPeople;
  }, [positionedPeople]);
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
    activeFamilyViewStyle,
    selectedPersonForLayout,
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
          visibleIdSet: renderVisibleIdSet,
          familyViewStyle,
          graphLineRoutingStyle: graphLineRoutingStyle ?? "orthogonal"
        })
      ),
    [
      familyViewStyle,
      filteredRelationships,
      graphLineRoutingStyle,
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
    renderNearPersonIds
  };
};
