import { useCallback, useRef, type MutableRefObject } from "react";
import { Vector3 } from "three";
import type { NodePosition } from "../layout";

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
  setCameraPosition: (position: NodePosition) => void;
};

export const useOrbitPositionSync = ({
  lastCameraSampleRef,
  setCameraPosition
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
      setCameraPosition([position.x, position.y, position.z]);
    },
    [lastCameraSampleRef, setCameraPosition]
  );

  const handleOrbitEnd = useCallback(
    (event: unknown) => {
      const position = getOrbitCameraPosition(event);
      if (!position) {
        return;
      }
      lastCameraStateUpdateMsRef.current = performance.now();
      lastCameraSampleRef.current.copy(position);
      setCameraPosition([position.x, position.y, position.z]);
    },
    [lastCameraSampleRef, setCameraPosition]
  );

  return {
    handleOrbitChange,
    handleOrbitEnd
  };
};
