import { useCallback } from "react";
import type { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FamilyViewStyle, NodePosition } from "./layout";

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
  familyViewStyle: FamilyViewStyle;
  cameraRef: React.MutableRefObject<PerspectiveCamera | null>;
  orbitControlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  lastCameraSampleRef: React.MutableRefObject<Vector3>;
  setCameraPosition: (position: NodePosition) => void;
};

export const useGraphCameraControls = ({
  graphBounds,
  visiblePositionsById,
  selectedPersonId,
  hoveredPersonId,
  focusPersonId,
  pinnedPersonId,
  familyViewStyle,
  cameraRef,
  orbitControlsRef,
  lastCameraSampleRef,
  setCameraPosition
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
      setCameraPosition(position);
    },
    [cameraRef, lastCameraSampleRef, orbitControlsRef, setCameraPosition]
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
    if (familyViewStyle === "generationTree" || familyViewStyle === "hybridTreeList") {
      applyCameraPose([center[0], center[1] + distance * 0.24, center[2] + distance * 1.04], center);
      return;
    }
    if (familyViewStyle === "centeredRelationshipMap") {
      applyCameraPose(
        [center[0] + distance * 0.42, center[1] + distance * 0.3, center[2] + distance * 0.88],
        center
      );
      return;
    }
    applyCameraPose([center[0] + distance * 0.55, center[1] + distance * 0.42, center[2] + distance], center);
  }, [applyCameraPose, familyViewStyle, graphBounds]);

  const focusActiveNode = useCallback(() => {
    const activeId = pinnedPersonId ?? hoveredPersonId ?? focusPersonId ?? selectedPersonId;
    if (!activeId) {
      frameAllNodes();
      return;
    }
    const target = visiblePositionsById.get(activeId);
    if (!target) {
      frameAllNodes();
      return;
    }
    if (familyViewStyle === "generationTree" || familyViewStyle === "hybridTreeList") {
      applyCameraPose([target[0], target[1] + 3.8, target[2] + 7.4], target);
      return;
    }
    if (familyViewStyle === "centeredRelationshipMap") {
      applyCameraPose([target[0] + 5.4, target[1] + 3.6, target[2] + 6.2], target);
      return;
    }
    applyCameraPose([target[0] + 7, target[1] + 4.8, target[2] + 8.2], target);
  }, [
    applyCameraPose,
    familyViewStyle,
    focusPersonId,
    frameAllNodes,
    hoveredPersonId,
    pinnedPersonId,
    selectedPersonId,
    visiblePositionsById
  ]);

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

  return {
    frameAllNodes,
    focusActiveNode,
    topDownView
  };
};
