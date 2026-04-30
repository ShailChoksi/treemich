/**
 * @file Layout backend orchestration for graph positioning.
 */

import { buildGraphLayoutRevision } from "@treemich/shared";
import { useEffect, useMemo, useRef } from "react";
import type { Person, PhotoCluster, RelationshipRecord } from "../../lib/api";
import { getLocalStorageItem } from "../../lib/safeLocalStorage";
import { positionPeople, type GraphLayoutMode, type NodePosition } from "./layout";
import { shouldUseLayoutWorker, TOPOLOGY_LAYOUT_CACHE_MAX_ENTRIES } from "./graphLayoutConstants";
import { evictOldestMapEntriesToCap } from "./topologyLayoutCache";
import { useGraphLayoutWorker } from "./useGraphLayoutWorker";
import type { LayoutWorkerPayload } from "./layoutWorkerTypes";

const SERVER_LAYOUT_ALGORITHM_VERSION = "server-hybrid-v1";

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

export type PositionedPerson = { person: Person; position: NodePosition };

type UseLayoutOrchestratorOptions = {
  people: Person[];
  peopleById: Map<string, Person>;
  topologyRelationships: RelationshipRecord[];
  photoClusters: PhotoCluster[];
  viewMode: GraphLayoutMode;
  primaryFamilyUnitByPersonId?: Record<string, string>;
  selectedPersonId: string | null;
  serverPositionsByPersonId?: Record<string, NodePosition>;
  serverLayoutRevision?: string | null;
  serverLayoutAlgorithmVersion?: string | null;
};

export const useLayoutOrchestrator = ({
  people,
  peopleById,
  topologyRelationships,
  photoClusters,
  viewMode,
  primaryFamilyUnitByPersonId,
  selectedPersonId,
  serverPositionsByPersonId,
  serverLayoutRevision,
  serverLayoutAlgorithmVersion
}: UseLayoutOrchestratorOptions) => {
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
      .filter((entry): entry is PositionedPerson => !!entry);
  }, [people, serverPositionsByPersonId, shouldUseServerLayout]);
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
        .filter((entry): entry is PositionedPerson => !!entry);
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
      .filter((entry): entry is PositionedPerson => !!entry);
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
      .filter((entry): entry is PositionedPerson => !!entry);
  }, [
    computedPositionedPeople,
    isWorkerFallbackEnabled,
    peopleById,
    shouldUseServerLayout,
    shouldUseWorker,
    workerPositions
  ]);
  const isWorkerLayoutPending = useMemo(
    () => shouldUseWorker && !shouldUseServerLayout && !isWorkerFallbackEnabled && workerPositions === null,
    [isWorkerFallbackEnabled, shouldUseServerLayout, shouldUseWorker, workerPositions]
  );

  return {
    isWorkerLayoutPending,
    positionedPeople,
    topologyRevision
  };
};
