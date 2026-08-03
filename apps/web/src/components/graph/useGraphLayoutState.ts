/**
 * @file Graph-related React hook: useGraphLayoutState.
 */

import { useMemo } from "react";
import {
  defaultFocusAncestorDepth,
  defaultFocusCollateralDepth,
  defaultFocusDescendantDepth,
  filterGraphLayoutTopologyRelationships
} from "@treemich/shared";
import type {
  Person,
  PhotoCluster,
  PhotoCooccurrenceEdge,
  RelationshipRecord,
  TreeLayoutPreferences
} from "../../lib/api";
import { buildParentChildIndex, type GraphLayoutMode, type NodePosition } from "./layout";
import { pickFocusMembershipIds } from "./focusMembership";
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
  treeLayoutPreferences?: TreeLayoutPreferences;
  /** Focus mode on/off (family layout only). */
  showSingleFamilyTree?: boolean;
  /** Session Focus Anchor person id. */
  focusAnchorId?: string | null;
  focusAncestorDepth?: number;
  focusDescendantDepth?: number;
  focusCollateralDepth?: number;
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
export { pickFocusMembershipIds } from "./focusMembership";

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

const relationshipTouchesMembership = (relationship: RelationshipRecord, membership: Set<string>) =>
  membership.has(relationship.fromPersonId) && membership.has(relationship.toPersonId);

export const useGraphLayoutState = ({
  people,
  relationships,
  photoEdges,
  photoClusters,
  viewMode,
  primaryFamilyUnitByPersonId,
  treeLayoutPreferences,
  showSingleFamilyTree = false,
  focusAnchorId = null,
  focusAncestorDepth = defaultFocusAncestorDepth,
  focusDescendantDepth = defaultFocusDescendantDepth,
  focusCollateralDepth = defaultFocusCollateralDepth,
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
  const focusActive =
    showSingleFamilyTree && viewMode === "family" && Boolean(focusAnchorId);

  const membershipIds = useMemo(() => {
    if (!focusActive) {
      return null;
    }
    return pickFocusMembershipIds(relationships, {
      anchorId: focusAnchorId,
      ancestorDepth: focusAncestorDepth,
      descendantDepth: focusDescendantDepth,
      collateralDepth: focusCollateralDepth
    });
  }, [
    focusActive,
    focusAnchorId,
    focusAncestorDepth,
    focusCollateralDepth,
    focusDescendantDepth,
    relationships
  ]);

  const layoutPeople = useMemo(() => {
    if (!membershipIds) {
      return people;
    }
    return people.filter((person) => membershipIds.has(person.id));
  }, [membershipIds, people]);

  const layoutRelationships = useMemo(() => {
    if (!membershipIds) {
      return relationships;
    }
    return relationships.filter((relationship) =>
      relationshipTouchesMembership(relationship, membershipIds)
    );
  }, [membershipIds, relationships]);

  const graphRelationships = useMemo(
    () => buildGraphRelationships(layoutRelationships, filterVisibility),
    [filterVisibility, layoutRelationships]
  );
  const filteredRelationships = graphRelationships.filteredRelationships;
  const topologyRelationships = graphRelationships.topologyRelationships;
  const peopleById = useMemo(
    () => new Map(layoutPeople.map((person) => [person.id, person])),
    [layoutPeople]
  );
  const { positionedPeople, topologyRevision, isWorkerLayoutPending } = useLayoutOrchestrator({
    people: layoutPeople,
    peopleById,
    topologyRelationships,
    photoClusters,
    viewMode,
    primaryFamilyUnitByPersonId,
    treeLayoutPreferences,
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
