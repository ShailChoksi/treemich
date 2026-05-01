/**
 * @file Merged parent groups and visible relationship line segments (batched for GL).
 */

import { useMemo } from "react";
import type { PhotoCooccurrenceEdge, RelationshipRecord } from "../../lib/api";
import { getLocalStorageItem } from "../../lib/safeLocalStorage";
import { buildMergedParentGroups, buildVisibleRelationshipLines } from "./graphRelationshipLines";
import type { GraphLayoutMode, NodePosition } from "./layout";

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

type UseGraphVisibleRelationshipLinesStepArgs = {
  viewMode: GraphLayoutMode;
  photoEdges: PhotoCooccurrenceEdge[];
  renderVisiblePositionsById: Map<string, NodePosition>;
  filteredParentsByChild: Map<string, Set<string>>;
  primaryFamilyUnitByPersonId?: Record<string, string>;
  filteredRelationships: RelationshipRecord[];
  renderVisibleIdSet: Set<string>;
};

export const useGraphVisibleRelationshipLinesStep = ({
  viewMode,
  photoEdges,
  renderVisiblePositionsById,
  filteredParentsByChild,
  primaryFamilyUnitByPersonId,
  filteredRelationships,
  renderVisibleIdSet
}: UseGraphVisibleRelationshipLinesStepArgs) => {
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

  return { renderMergedParentGroups, renderVisibleRelationshipLines };
};
