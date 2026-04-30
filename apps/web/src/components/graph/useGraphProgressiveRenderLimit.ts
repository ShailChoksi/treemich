/**
 * @file Progressive graph node reveal: cap grows in batches so large graphs do not spike one frame.
 */

import { useEffect, useMemo, useState } from "react";
import type { GraphLayoutMode } from "./layout";

export const PROGRESSIVE_RENDER_BATCH_INTERVAL_MS = 150;

type UseGraphProgressiveRenderLimitArgs = {
  renderLimit: number;
  candidateCount: number;
  topologyRevision: string;
  viewMode: GraphLayoutMode;
};

export const useGraphProgressiveRenderLimit = ({
  renderLimit,
  candidateCount,
  topologyRevision,
  viewMode
}: UseGraphProgressiveRenderLimitArgs) => {
  const baseRenderLimit = Math.max(1, renderLimit);
  const [progressiveRenderLimit, setProgressiveRenderLimit] = useState(baseRenderLimit);

  useEffect(() => {
    setProgressiveRenderLimit(baseRenderLimit);
  }, [baseRenderLimit, candidateCount, topologyRevision, viewMode]);

  useEffect(() => {
    if (candidateCount <= progressiveRenderLimit) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setProgressiveRenderLimit((current) => {
        const nextLimit = current + baseRenderLimit;
        return Math.min(nextLimit, candidateCount);
      });
    }, PROGRESSIVE_RENDER_BATCH_INTERVAL_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [baseRenderLimit, candidateCount, progressiveRenderLimit]);

  const effectiveRenderLimit = useMemo(
    () => Math.min(progressiveRenderLimit, candidateCount),
    [candidateCount, progressiveRenderLimit]
  );

  return { effectiveRenderLimit, progressiveRenderLimit, baseRenderLimit };
};
