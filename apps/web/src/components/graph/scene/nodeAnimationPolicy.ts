export const shouldSkipNodeAnimationFrame = ({
  reduceWorkForLargeGraph,
  isPriorityNode,
  frameTick
}: {
  reduceWorkForLargeGraph: boolean;
  isPriorityNode: boolean;
  frameTick: number;
}) => reduceWorkForLargeGraph && !isPriorityNode && frameTick % 2 !== 0;
