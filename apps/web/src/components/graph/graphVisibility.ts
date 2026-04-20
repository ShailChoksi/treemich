import type { NodePosition } from "./layout";

export type GraphVisibilityBucket = "near" | "mid" | "far" | "culled";

export type GraphVisibilityThresholds = {
  nearEnterRadius: number;
  nearExitRadius: number;
  midEnterRadius: number;
  midExitRadius: number;
  farEnterRadius: number;
  farExitRadius: number;
};

export const defaultGraphVisibilityThresholds: GraphVisibilityThresholds = {
  nearEnterRadius: 24,
  nearExitRadius: 30,
  midEnterRadius: 64,
  midExitRadius: 78,
  farEnterRadius: 140,
  farExitRadius: 170
};

const sq = (value: number) => value * value;

export const resolveVisibilityBucket = ({
  distanceSq,
  previousBucket,
  thresholds
}: {
  distanceSq: number;
  previousBucket?: GraphVisibilityBucket;
  thresholds?: GraphVisibilityThresholds;
}): GraphVisibilityBucket => {
  const resolved = thresholds ?? defaultGraphVisibilityThresholds;
  const nearEnterSq = sq(resolved.nearEnterRadius);
  const nearExitSq = sq(resolved.nearExitRadius);
  const midEnterSq = sq(resolved.midEnterRadius);
  const midExitSq = sq(resolved.midExitRadius);
  const farEnterSq = sq(resolved.farEnterRadius);
  const farExitSq = sq(resolved.farExitRadius);

  if (previousBucket === "near") {
    if (distanceSq <= nearExitSq) {
      return "near";
    }
  } else if (previousBucket === "mid") {
    if (distanceSq <= nearEnterSq) {
      return "near";
    }
    if (distanceSq <= midExitSq) {
      return "mid";
    }
  } else if (previousBucket === "far") {
    if (distanceSq <= nearEnterSq) {
      return "near";
    }
    if (distanceSq <= midEnterSq) {
      return "mid";
    }
    if (distanceSq <= farExitSq) {
      return "far";
    }
  } else if (previousBucket === "culled") {
    if (distanceSq <= nearEnterSq) {
      return "near";
    }
    if (distanceSq <= midEnterSq) {
      return "mid";
    }
    if (distanceSq <= farEnterSq) {
      return "far";
    }
  }

  if (distanceSq <= nearEnterSq) {
    return "near";
  }
  if (distanceSq <= midEnterSq) {
    return "mid";
  }
  if (distanceSq <= farEnterSq) {
    return "far";
  }
  return "culled";
};

export const computeCameraVisibility = ({
  displayPeople,
  cameraPosition,
  prioritizedNodeIds,
  previousBuckets,
  thresholds,
  minVisibleCount = 0
}: {
  displayPeople: Array<{ personId: string; displayPosition: NodePosition }>;
  cameraPosition: NodePosition;
  prioritizedNodeIds: Set<string>;
  previousBuckets: Map<string, GraphVisibilityBucket>;
  thresholds?: GraphVisibilityThresholds;
  minVisibleCount?: number;
}) => {
  const bucketByPersonId = new Map<string, GraphVisibilityBucket>();
  const renderVisibleIdSet = new Set<string>();
  const nearPersonIds: string[] = [];
  const distanceSqByPersonId = new Map<string, number>();

  for (const item of displayPeople) {
    const previousBucket = previousBuckets.get(item.personId);
    const dx = item.displayPosition[0] - cameraPosition[0];
    const dy = item.displayPosition[1] - cameraPosition[1];
    const dz = item.displayPosition[2] - cameraPosition[2];
    const distanceSq = dx * dx + dy * dy + dz * dz;
    distanceSqByPersonId.set(item.personId, distanceSq);
    const bucket = resolveVisibilityBucket({
      distanceSq,
      previousBucket,
      thresholds
    });
    bucketByPersonId.set(item.personId, bucket);
    if (bucket === "near") {
      nearPersonIds.push(item.personId);
    }
    if (bucket !== "culled" || prioritizedNodeIds.has(item.personId)) {
      renderVisibleIdSet.add(item.personId);
    }
  }

  if (minVisibleCount > 0 && renderVisibleIdSet.size < minVisibleCount) {
    const supplementalIds = displayPeople
      .map((item) => item.personId)
      .filter((personId) => !renderVisibleIdSet.has(personId))
      .sort(
        (left, right) =>
          (distanceSqByPersonId.get(left) ?? Number.POSITIVE_INFINITY) -
          (distanceSqByPersonId.get(right) ?? Number.POSITIVE_INFINITY)
      );

    for (const personId of supplementalIds) {
      renderVisibleIdSet.add(personId);
      if (bucketByPersonId.get(personId) === "culled") {
        bucketByPersonId.set(personId, "far");
      }
      if (renderVisibleIdSet.size >= minVisibleCount) {
        break;
      }
    }
  }

  return {
    bucketByPersonId,
    renderVisibleIdSet,
    nearPersonIds
  };
};
