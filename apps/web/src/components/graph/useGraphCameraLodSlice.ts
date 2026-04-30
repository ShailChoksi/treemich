/**
 * @file Camera-distance buckets and post-LOD visible people lists (same snapshot as display positions).
 */

import { useEffect, useMemo, useRef } from "react";
import type { Person } from "../../lib/api";
import {
  computeCameraVisibility,
  type GraphVisibilityBucket,
  type GraphVisibilityThresholds
} from "./graphVisibility";
import type { NodePosition } from "./layout";

type DisplayItem = {
  person: Person;
  displayPosition: NodePosition;
};

type UseGraphCameraLodSliceArgs = {
  displayVisiblePeople: DisplayItem[];
  cameraPosition?: NodePosition;
  visibilityThresholds?: GraphVisibilityThresholds;
  prioritizedNodeIds: Set<string>;
};

export const useGraphCameraLodSlice = ({
  displayVisiblePeople,
  cameraPosition,
  visibilityThresholds,
  prioritizedNodeIds
}: UseGraphCameraLodSliceArgs) => {
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
        minVisibleCount: displayVisiblePeople.length
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

  const renderNearPersonIds = useMemo(
    () =>
      renderVisiblePeople
        .map((item) => item.person.id)
        .filter((personId) => renderVisibilityState.bucketByPersonId.get(personId) === "near"),
    [renderVisibilityState.bucketByPersonId, renderVisiblePeople]
  );

  return {
    renderNearPersonIds,
    renderVisibilityBucketByPersonId: renderVisibilityState.bucketByPersonId,
    renderVisiblePeople,
    renderVisiblePositionsById,
    renderVisibleIdSet
  };
};
