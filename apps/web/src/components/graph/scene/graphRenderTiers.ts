import type { GraphVisibilityBucket } from "../graphVisibility";

const LARGE_GRAPH_NODE_THRESHOLD = 280;

export const shouldUseLargeGraphTier = (visiblePeopleCount: number) =>
  visiblePeopleCount >= LARGE_GRAPH_NODE_THRESHOLD;

export const shouldRenderDetailedNode = ({
  largeGraphTierEnabled,
  isPriorityNode,
  visibilityBucket = "near"
}: {
  largeGraphTierEnabled: boolean;
  isPriorityNode: boolean;
  visibilityBucket?: GraphVisibilityBucket;
}) =>
  (!largeGraphTierEnabled || isPriorityNode) && visibilityBucket !== "far" && visibilityBucket !== "culled";

export const resolveNodeRenderTier = ({
  visibilityBucket,
  isPriorityNode,
  largeGraphTierEnabled,
  hasThumbnail = false
}: {
  visibilityBucket: GraphVisibilityBucket;
  isPriorityNode: boolean;
  largeGraphTierEnabled: boolean;
  hasThumbnail?: boolean;
}) => {
  if (isPriorityNode) {
    return "detailed" as const;
  }
  if (visibilityBucket === "culled") {
    return "minimal" as const;
  }
  if (hasThumbnail) {
    return "thumbnail" as const;
  }
  if (visibilityBucket === "mid" || visibilityBucket === "far") {
    return "thumbnail" as const;
  }
  return shouldRenderDetailedNode({
    largeGraphTierEnabled,
    isPriorityNode,
    visibilityBucket
  })
    ? ("detailed" as const)
    : ("minimal" as const);
};

export const shouldRenderInstancedVisualForNode = ({ hasThumbnail }: { hasThumbnail: boolean }) =>
  !hasThumbnail;
