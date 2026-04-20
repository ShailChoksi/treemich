import { useEffect, useRef, useState } from "react";
import type { NodePosition } from "./layout/types";
import { requestPositionPeopleInWorker } from "./layoutWorkerClient";
import type { LayoutWorkerPayload } from "./layoutWorkerTypes";

type WorkerPositionEntry = { personId: string; position: NodePosition };

export const useGraphLayoutWorker = ({
  shouldUseWorker,
  shouldUseServerLayout,
  workerPayload
}: {
  shouldUseWorker: boolean;
  shouldUseServerLayout: boolean;
  workerPayload: LayoutWorkerPayload;
}) => {
  const workerRequestIdRef = useRef(0);
  const hasLoggedWorkerFailureRef = useRef(false);
  const [workerPositions, setWorkerPositions] = useState<WorkerPositionEntry[] | null>(null);
  const [isWorkerFallbackEnabled, setIsWorkerFallbackEnabled] = useState(false);

  useEffect(() => {
    if (!shouldUseWorker || isWorkerFallbackEnabled || shouldUseServerLayout) {
      workerRequestIdRef.current += 1;
      setWorkerPositions(null);
      return;
    }
    const requestId = workerRequestIdRef.current + 1;
    workerRequestIdRef.current = requestId;
    setWorkerPositions(null);
    let isDisposed = false;
    void requestPositionPeopleInWorker(workerPayload)
      .then((positions) => {
        if (isDisposed || workerRequestIdRef.current !== requestId) {
          return;
        }
        setWorkerPositions(positions);
      })
      .catch((error) => {
        if (isDisposed || workerRequestIdRef.current !== requestId) {
          return;
        }
        if (!hasLoggedWorkerFailureRef.current) {
          hasLoggedWorkerFailureRef.current = true;
          console.warn("[graph-layout] falling back to sync layout after worker failure", error);
        }
        setIsWorkerFallbackEnabled(true);
        setWorkerPositions(null);
      });
    return () => {
      isDisposed = true;
    };
  }, [isWorkerFallbackEnabled, shouldUseServerLayout, shouldUseWorker, workerPayload]);

  useEffect(() => {
    if (!shouldUseWorker) {
      setIsWorkerFallbackEnabled(false);
      hasLoggedWorkerFailureRef.current = false;
    }
  }, [shouldUseWorker]);

  return {
    workerPositions,
    isWorkerFallbackEnabled
  };
};
