/**
 * @file Visibility, progressive rendering, and visible edge construction for the graph.
 */

import type { PhotoCooccurrenceEdge, RelationshipRecord } from "../../lib/api";
import type { GraphVisibilityThresholds } from "./graphVisibility";
import type { GraphLayoutMode, NodePosition } from "./layout";
import type { PositionedPerson } from "./useLayoutOrchestrator";
import { useGraphCameraLodSlice } from "./useGraphCameraLodSlice";
import { useGraphProgressiveRenderLimit } from "./useGraphProgressiveRenderLimit";
import { useGraphVisiblePeoplePipeline } from "./useGraphVisiblePeoplePipeline";
import { useGraphVisibleRelationshipLinesStep } from "./useGraphVisibleRelationshipLinesStep";

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
  const candidatePositionedPeople = positionedPeople;
  const candidateCount = candidatePositionedPeople.length;

  const { effectiveRenderLimit } = useGraphProgressiveRenderLimit({
    renderLimit,
    candidateCount,
    topologyRevision,
    viewMode
  });

  const { displayVisiblePeople, graphBounds, visiblePositionsById } = useGraphVisiblePeoplePipeline({
    positionedPeople,
    positionedById,
    effectiveRenderLimit,
    selectedPersonId,
    focusPersonId,
    pinnedPersonId
  });

  const {
    renderNearPersonIds,
    renderVisibilityBucketByPersonId,
    renderVisiblePeople,
    renderVisiblePositionsById,
    renderVisibleIdSet
  } = useGraphCameraLodSlice({
    displayVisiblePeople,
    cameraPosition,
    visibilityThresholds,
    prioritizedNodeIds
  });

  const { renderVisibleRelationshipLines } = useGraphVisibleRelationshipLinesStep({
    viewMode,
    photoEdges,
    renderVisiblePositionsById,
    filteredParentsByChild,
    primaryFamilyUnitByPersonId,
    filteredRelationships,
    renderVisibleIdSet
  });

  return {
    displayVisiblePeople,
    graphBounds,
    renderNearPersonIds,
    renderVisibilityBucketByPersonId,
    renderVisiblePeople,
    renderVisiblePositionsById,
    renderVisibleRelationshipLines,
    visiblePositionsById
  };
};
