/**
 * @file Graph-related React hook: useGraphLayoutState.
 */

import { useMemo } from "react";
import { filterGraphLayoutTopologyRelationships } from "@treemich/shared";
import type { Person, PhotoCluster, PhotoCooccurrenceEdge, RelationshipRecord } from "../../lib/api";
import { buildParentChildIndex, type GraphLayoutMode, type NodePosition } from "./layout";
import { relationshipFilterForType, type GraphFilterVisibility } from "./relationshipStyles";
import type { GraphVisibilityThresholds } from "./graphVisibility";
import { useLayoutOrchestrator } from "./useLayoutOrchestrator";
import { useGraphVisibility } from "./useGraphVisibility";

type UseGraphLayoutStateOptions = {
  people: Person[];
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

export { pickNearest } from "./pickNearest";

export const filterRelationshipsByLayer = (
  relationships: RelationshipRecord[],
  filterVisibility: GraphFilterVisibility
) =>
  relationships.filter((relationship) => {
    const filter = relationshipFilterForType(relationship.type);
    return filterVisibility[filter];
  });

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
  const graphRelationships = useMemo(
    () => buildGraphRelationships(relationships, filterVisibility),
    [filterVisibility, relationships]
  );
  const filteredRelationships = graphRelationships.filteredRelationships;
  const topologyRelationships = graphRelationships.topologyRelationships;
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const { positionedPeople, topologyRevision, isWorkerLayoutPending } = useLayoutOrchestrator({
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
  });
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
  const {
    displayVisiblePeople,
    graphBounds,
    renderNearPersonIds,
    renderVisibilityBucketByPersonId,
    renderVisiblePeople,
    renderVisiblePositionsById,
    renderVisibleRelationshipLines,
    visiblePositionsById
  } = useGraphVisibility({
    positionedPeople,
    positionedById,
    filteredRelationships,
    filteredParentsByChild: graphRelationships.filteredParentsByChild,
    photoEdges,
    viewMode,
    primaryFamilyUnitByPersonId,
    selectedPersonId,
    hoveredPersonId,
    focusPersonId,
    pinnedPersonId,
    cameraPosition,
    visibilityThresholds,
    renderLimit,
    topologyRevision,
    prioritizedNodeIds
  });

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
    renderVisibilityBucketByPersonId,
    renderNearPersonIds,
    isWorkerLayoutPending
  };
};
