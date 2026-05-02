/**
 * @file Centralizes graph camera startup sequencing, focus consumption, and restored snapshot wiring.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { NodePosition } from "./layout";
import type { GraphCameraIntent } from "../../lib/workspaceUiState";
import {
  areCameraControlsAndPersonPositionReady,
  shouldGiveUpFocusWaitForMissingGraphPerson,
  type GraphCameraPose,
  type GraphCameraSessionKind,
  type StartupCameraIntent
} from "./graphCameraPolicy";

export type UseGraphCameraOrchestratorOptions = {
  graphCameraSessionKind: GraphCameraSessionKind;
  startupIntent: StartupCameraIntent;
  focusPersonRequest: string | null;
  cameraFocusPersonRequest: string | null;
  visiblePositionsById: ReadonlyMap<string, NodePosition>;
  graphBounds: { min: NodePosition; max: NodePosition } | null;
  /** True once people/relationships finished loading without a blocking error. */
  graphModelReady: boolean;
  knownPersonIds: ReadonlySet<string>;
  /** Raw saved camera from workspace UI (may be non-null even when canvas restore was suppressed). */
  fallbackSavedCamera: GraphCameraPose | null;
  focusPersonById: (personId: string) => void;
  frameAllNodes: () => void;
  applyPersistedCameraPose: (pose: GraphCameraPose) => void;
  onCameraFocusPersonConsumed: () => void;
  onFocusPersonConsumed: () => void;
  setFocusPersonId: (personId: string | null) => void;
  cameraRef: React.MutableRefObject<PerspectiveCamera | null>;
  orbitControlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  /** Bumps when R3F camera + OrbitControls refs are first attached (GraphCanvasScene). */
  canvasCameraReadyGeneration: number;
  lastAutoCenteredFocusPersonIdRef: React.MutableRefObject<string | null>;
  /** Fires once when a non-restore startup camera path successfully applies (for persistence semantics). */
  onStartupCameraIntentApplied?: (intent: GraphCameraIntent) => void;
};

export type UseGraphCameraOrchestratorResult = {
  hasCompletedStartupCameraRef: React.MutableRefObject<boolean>;
};

const applyStartupFocusWithIntent = ({
  personId,
  setFocusPersonId,
  focusPersonById,
  lastAutoCenteredFocusPersonIdRef,
  onStartupCameraIntentApplied,
  intent
}: {
  personId: string;
  setFocusPersonId: (personId: string | null) => void;
  focusPersonById: (personId: string) => void;
  lastAutoCenteredFocusPersonIdRef: React.MutableRefObject<string | null>;
  onStartupCameraIntentApplied?: (intent: GraphCameraIntent) => void;
  intent: GraphCameraIntent;
}) => {
  setFocusPersonId(personId);
  focusPersonById(personId);
  lastAutoCenteredFocusPersonIdRef.current = personId;
  onStartupCameraIntentApplied?.(intent);
};

export const useGraphCameraOrchestrator = ({
  graphCameraSessionKind,
  startupIntent,
  focusPersonRequest,
  cameraFocusPersonRequest,
  visiblePositionsById,
  graphBounds,
  graphModelReady,
  knownPersonIds,
  fallbackSavedCamera,
  focusPersonById,
  frameAllNodes,
  applyPersistedCameraPose,
  onCameraFocusPersonConsumed,
  onFocusPersonConsumed,
  setFocusPersonId,
  cameraRef,
  orbitControlsRef,
  canvasCameraReadyGeneration,
  lastAutoCenteredFocusPersonIdRef,
  onStartupCameraIntentApplied
}: UseGraphCameraOrchestratorOptions): UseGraphCameraOrchestratorResult => {
  const visiblePersonIds = useMemo(() => new Set(visiblePositionsById.keys()), [visiblePositionsById]);

  const hasInitializedCameraRef = useRef(false);

  const applyMissingFocusTargetFallback = useCallback(() => {
    if (fallbackSavedCamera) {
      applyPersistedCameraPose(fallbackSavedCamera);
      onStartupCameraIntentApplied?.("manual");
    } else if (graphBounds) {
      frameAllNodes();
      onStartupCameraIntentApplied?.("frameAll");
    }
  }, [
    applyPersistedCameraPose,
    fallbackSavedCamera,
    frameAllNodes,
    graphBounds,
    onStartupCameraIntentApplied
  ]);

  useEffect(() => {
    const cameraReady = Boolean(cameraRef.current);
    const controlsReady = Boolean(orbitControlsRef.current);

    if (!hasInitializedCameraRef.current) {
      if (startupIntent.kind === "restoreSavedCamera") {
        hasInitializedCameraRef.current = true;
        if (graphCameraSessionKind === "workspaceRemount" && cameraFocusPersonRequest) {
          onCameraFocusPersonConsumed();
        }
        return;
      }

      if (startupIntent.kind === "explicitFocus") {
        const personId = startupIntent.personId;
        if (shouldGiveUpFocusWaitForMissingGraphPerson({ graphModelReady, personId, knownPersonIds })) {
          hasInitializedCameraRef.current = true;
          applyMissingFocusTargetFallback();
          onFocusPersonConsumed();
          return;
        }
        if (
          !areCameraControlsAndPersonPositionReady({
            hasPerspectiveCamera: cameraReady,
            hasOrbitControls: controlsReady,
            personId,
            visiblePersonIds
          })
        ) {
          return;
        }
        applyStartupFocusWithIntent({
          personId,
          setFocusPersonId,
          focusPersonById,
          lastAutoCenteredFocusPersonIdRef,
          onStartupCameraIntentApplied,
          intent: "explicitFocus"
        });
        onFocusPersonConsumed();
        hasInitializedCameraRef.current = true;
        return;
      }

      if (startupIntent.kind === "selectedPersonFocus") {
        const personId = startupIntent.personId;
        if (shouldGiveUpFocusWaitForMissingGraphPerson({ graphModelReady, personId, knownPersonIds })) {
          hasInitializedCameraRef.current = true;
          applyMissingFocusTargetFallback();
          onCameraFocusPersonConsumed();
          return;
        }
        if (
          !areCameraControlsAndPersonPositionReady({
            hasPerspectiveCamera: cameraReady,
            hasOrbitControls: controlsReady,
            personId,
            visiblePersonIds
          })
        ) {
          return;
        }
        applyStartupFocusWithIntent({
          personId,
          setFocusPersonId,
          focusPersonById,
          lastAutoCenteredFocusPersonIdRef,
          onStartupCameraIntentApplied,
          intent: "selectedFocus"
        });
        onCameraFocusPersonConsumed();
        hasInitializedCameraRef.current = true;
        return;
      }

      if (startupIntent.kind === "frameAll") {
        if (!graphBounds) {
          return;
        }
        if (
          !areCameraControlsAndPersonPositionReady({
            hasPerspectiveCamera: cameraReady,
            hasOrbitControls: controlsReady,
            personId: null,
            visiblePersonIds
          })
        ) {
          return;
        }
        frameAllNodes();
        hasInitializedCameraRef.current = true;
        onStartupCameraIntentApplied?.("frameAll");
        return;
      }
    }

    if (focusPersonRequest) {
      if (
        shouldGiveUpFocusWaitForMissingGraphPerson({
          graphModelReady,
          personId: focusPersonRequest,
          knownPersonIds
        })
      ) {
        onFocusPersonConsumed();
        return;
      }
      if (
        !areCameraControlsAndPersonPositionReady({
          hasPerspectiveCamera: cameraReady,
          hasOrbitControls: controlsReady,
          personId: focusPersonRequest,
          visiblePersonIds
        })
      ) {
        return;
      }
      applyStartupFocusWithIntent({
        personId: focusPersonRequest,
        setFocusPersonId,
        focusPersonById,
        lastAutoCenteredFocusPersonIdRef,
        onStartupCameraIntentApplied,
        intent: "explicitFocus"
      });
      onFocusPersonConsumed();
      return;
    }

    if (!cameraFocusPersonRequest) {
      return;
    }
    if (
      shouldGiveUpFocusWaitForMissingGraphPerson({
        graphModelReady,
        personId: cameraFocusPersonRequest,
        knownPersonIds
      })
    ) {
      onCameraFocusPersonConsumed();
      return;
    }
    if (!visiblePersonIds.has(cameraFocusPersonRequest)) {
      return;
    }
    if (!cameraReady || !controlsReady) {
      return;
    }
    applyStartupFocusWithIntent({
      personId: cameraFocusPersonRequest,
      setFocusPersonId,
      focusPersonById,
      lastAutoCenteredFocusPersonIdRef,
      onStartupCameraIntentApplied,
      intent: "selectedFocus"
    });
    onCameraFocusPersonConsumed();
  }, [
    applyMissingFocusTargetFallback,
    applyPersistedCameraPose,
    cameraFocusPersonRequest,
    cameraRef,
    canvasCameraReadyGeneration,
    fallbackSavedCamera,
    focusPersonById,
    focusPersonRequest,
    frameAllNodes,
    graphBounds,
    graphCameraSessionKind,
    graphModelReady,
    knownPersonIds,
    onCameraFocusPersonConsumed,
    onFocusPersonConsumed,
    onStartupCameraIntentApplied,
    orbitControlsRef,
    lastAutoCenteredFocusPersonIdRef,
    setFocusPersonId,
    startupIntent,
    visiblePersonIds
  ]);

  return { hasCompletedStartupCameraRef: hasInitializedCameraRef };
};
