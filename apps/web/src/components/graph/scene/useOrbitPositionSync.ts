/**
 * @file Three.js scene layer: useOrbitPositionSync.ts.
 */

import { useCallback, useRef, type MutableRefObject } from "react";
import { Vector3 } from "three";

const getOrbitCameraPosition = (event: unknown): Vector3 | null => {
  if (!event || typeof event !== "object") {
    return null;
  }
  const candidate = event as {
    target?: {
      object?: {
        position?: unknown;
      };
    };
  };
  const position = candidate.target?.object?.position;
  return position instanceof Vector3 ? position : null;
};

type UseOrbitPositionSyncOptions = {
  lastCameraSampleRef: MutableRefObject<Vector3>;
  onSampledPosition?: (position: Vector3) => void;
};

export const useOrbitPositionSync = ({
  lastCameraSampleRef,
  onSampledPosition
}: UseOrbitPositionSyncOptions) => {
  const lastCameraStateUpdateMsRef = useRef(0);

  const handleOrbitChange = useCallback(
    (event: unknown) => {
      const position = getOrbitCameraPosition(event);
      if (!position) {
        return;
      }

      if (lastCameraSampleRef.current.distanceToSquared(position) < 0.2) {
        return;
      }

      const now = performance.now();
      if (now - lastCameraStateUpdateMsRef.current < 90) {
        return;
      }

      lastCameraStateUpdateMsRef.current = now;
      lastCameraSampleRef.current.copy(position);
      onSampledPosition?.(position);
    },
    [lastCameraSampleRef, onSampledPosition]
  );

  const handleOrbitEnd = useCallback(
    (event: unknown) => {
      const position = getOrbitCameraPosition(event);
      if (!position) {
        return;
      }
      lastCameraStateUpdateMsRef.current = performance.now();
      lastCameraSampleRef.current.copy(position);
      onSampledPosition?.(position);
    },
    [lastCameraSampleRef, onSampledPosition]
  );

  return {
    handleOrbitChange,
    handleOrbitEnd
  };
};
