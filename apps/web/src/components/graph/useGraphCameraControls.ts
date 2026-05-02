/**
 * @file Graph-related React hook: useGraphCameraControls.
 */

import { invalidate } from "@react-three/fiber";
import { useCallback } from "react";
import { Vector3, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { NodePosition } from "./layout";

type UseGraphCameraControlsOptions = {
  graphBounds: {
    min: NodePosition;
    max: NodePosition;
  } | null;
  visiblePositionsById: Map<string, NodePosition>;
  selectedPersonId: string | null;
  hoveredPersonId: string | null;
  focusPersonId: string | null;
  pinnedPersonId: string | null;
  cameraRef: React.MutableRefObject<PerspectiveCamera | null>;
  orbitControlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  lastCameraSampleRef: React.MutableRefObject<Vector3>;
};

export const getFocusCameraPose = (
  target: NodePosition
): { position: NodePosition; target: NodePosition } => ({
  position: [target[0], target[1] + 3.8, target[2] + 7.4],
  target
});

export const useGraphCameraControls = ({
  graphBounds,
  visiblePositionsById,
  selectedPersonId,
  hoveredPersonId,
  focusPersonId,
  pinnedPersonId,
  cameraRef,
  orbitControlsRef,
  lastCameraSampleRef
}: UseGraphCameraControlsOptions) => {
  const applyCameraPose = useCallback(
    (position: NodePosition, target: NodePosition) => {
      const camera = cameraRef.current;
      const controls = orbitControlsRef.current;
      if (!camera || !controls) {
        return;
      }
      camera.position.set(position[0], position[1], position[2]);
      controls.target.set(target[0], target[1], target[2]);
      camera.updateProjectionMatrix();
      controls.update();
      lastCameraSampleRef.current.set(position[0], position[1], position[2]);
      invalidate();
    },
    [cameraRef, lastCameraSampleRef, orbitControlsRef]
  );

  const frameAllNodes = useCallback(() => {
    if (!graphBounds) {
      return;
    }
    const center: NodePosition = [
      (graphBounds.min[0] + graphBounds.max[0]) / 2,
      (graphBounds.min[1] + graphBounds.max[1]) / 2,
      (graphBounds.min[2] + graphBounds.max[2]) / 2
    ];
    const spanX = graphBounds.max[0] - graphBounds.min[0];
    const spanY = graphBounds.max[1] - graphBounds.min[1];
    const spanZ = graphBounds.max[2] - graphBounds.min[2];
    const radius = Math.max(spanX, spanY * 1.3, spanZ, 12);
    const distance = radius * 1.35;
    applyCameraPose([center[0], center[1] + distance * 0.24, center[2] + distance * 1.04], center);
  }, [applyCameraPose, graphBounds]);

  const focusPersonById = useCallback(
    (personId: string) => {
      const target = visiblePositionsById.get(personId);
      if (!target) {
        frameAllNodes();
        return;
      }
      const pose = getFocusCameraPose(target);
      applyCameraPose(pose.position, pose.target);
    },
    [applyCameraPose, frameAllNodes, visiblePositionsById]
  );

  const focusActiveNode = useCallback(() => {
    const activeId = pinnedPersonId ?? hoveredPersonId ?? focusPersonId ?? selectedPersonId;
    if (!activeId) {
      frameAllNodes();
      return;
    }
    focusPersonById(activeId);
  }, [focusPersonById, focusPersonId, frameAllNodes, hoveredPersonId, pinnedPersonId, selectedPersonId]);

  const topDownView = useCallback(() => {
    if (!graphBounds) {
      return;
    }
    const center: NodePosition = [
      (graphBounds.min[0] + graphBounds.max[0]) / 2,
      (graphBounds.min[1] + graphBounds.max[1]) / 2,
      (graphBounds.min[2] + graphBounds.max[2]) / 2
    ];
    const spanX = graphBounds.max[0] - graphBounds.min[0];
    const spanZ = graphBounds.max[2] - graphBounds.min[2];
    const topHeight = Math.max(26, Math.max(spanX, spanZ) * 1.2);
    applyCameraPose([center[0], center[1] + topHeight, center[2] + 0.1], center);
  }, [applyCameraPose, graphBounds]);

  const nudgeCamera = useCallback(
    (forwardUnits: number, rightUnits: number) => {
      if (forwardUnits === 0 && rightUnits === 0) {
        return;
      }

      const camera = cameraRef.current;
      const controls = orbitControlsRef.current;
      if (!camera || !controls) {
        return;
      }

      const step = 1.6;
      const worldUp = new Vector3(0, 1, 0);
      const viewDirection = controls.target.clone().sub(camera.position);
      viewDirection.y = 0;
      if (viewDirection.lengthSq() < 0.000001) {
        viewDirection.set(0, 0, -1);
      } else {
        viewDirection.normalize();
      }

      const rightDirection = new Vector3().crossVectors(viewDirection, worldUp).normalize();
      const delta = new Vector3()
        .addScaledVector(viewDirection, forwardUnits * step)
        .addScaledVector(rightDirection, rightUnits * step);

      const nextPosition = camera.position.clone().add(delta);
      const nextTarget = controls.target.clone().add(delta);
      applyCameraPose(
        [nextPosition.x, nextPosition.y, nextPosition.z],
        [nextTarget.x, nextTarget.y, nextTarget.z]
      );
    },
    [applyCameraPose, cameraRef, orbitControlsRef]
  );

  return {
    applyCameraPose,
    frameAllNodes,
    focusPersonById,
    focusActiveNode,
    topDownView,
    nudgeCamera
  };
};
