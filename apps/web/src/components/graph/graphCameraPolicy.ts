/**
 * @file Pure policy for graph camera restore vs focus intent (no R3F / React).
 */

import type { GraphCameraIntent, GraphUiSnapshot, Vector3Tuple } from "../../lib/workspaceUiState";

export type GraphCameraSessionKind = "hardPageLoad" | "workspaceRemount";

const GRAPH_CAMERA_SESSION_STORAGE_KEY = "treemich.graph.camera.hardBootstrapConsumed";

/**
 * First graph mount in a tab session (or after a full reload) uses `hardPageLoad` camera policy;
 * later mounts in the same SPA session without reload use `workspaceRemount` (preserve saved camera).
 */
export const consumeGraphCameraSessionKindFromBrowser = (): GraphCameraSessionKind => {
  if (typeof window === "undefined") {
    return "hardPageLoad";
  }
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav?.type === "reload") {
    sessionStorage.removeItem(GRAPH_CAMERA_SESSION_STORAGE_KEY);
  }
  if (sessionStorage.getItem(GRAPH_CAMERA_SESSION_STORAGE_KEY) === "1") {
    return "workspaceRemount";
  }
  sessionStorage.setItem(GRAPH_CAMERA_SESSION_STORAGE_KEY, "1");
  return "hardPageLoad";
};

export type GraphCameraPose = {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
};

export type StartupCameraIntent =
  | { kind: "explicitFocus"; personId: string }
  | { kind: "selectedPersonFocus"; personId: string }
  | { kind: "restoreSavedCamera"; snapshot: GraphCameraPose }
  | { kind: "frameAll" };

/**
 * Resolves whether a persisted camera snapshot should be applied to the canvas on mount.
 *
 * Priority for suppressing saved camera: explicit focus > first-load selected-person focus.
 * Workspace remount preserves saved camera even when a focus request exists.
 */
export const resolveRestoredCameraSnapshotForCanvas = <T extends GraphCameraPose>({
  sessionKind,
  explicitFocusPersonId,
  cameraFocusPersonRequest,
  savedCamera
}: {
  sessionKind: GraphCameraSessionKind;
  explicitFocusPersonId: string | null;
  cameraFocusPersonRequest: string | null;
  savedCamera: T | null | undefined;
}): T | null => {
  if (explicitFocusPersonId) {
    return null;
  }
  if (savedCamera == null) {
    return null;
  }
  if (sessionKind === "hardPageLoad" && cameraFocusPersonRequest) {
    return null;
  }
  return savedCamera;
};

/**
 * Startup intent after restore snapshot decision: explicit > first-load selected > saved > frame all.
 */
export const resolveStartupCameraIntent = ({
  sessionKind,
  explicitFocusPersonId,
  cameraFocusPersonRequest,
  restoredCameraSnapshot
}: {
  sessionKind: GraphCameraSessionKind;
  explicitFocusPersonId: string | null;
  cameraFocusPersonRequest: string | null;
  restoredCameraSnapshot: GraphCameraPose | null;
}): StartupCameraIntent => {
  if (explicitFocusPersonId) {
    return { kind: "explicitFocus", personId: explicitFocusPersonId };
  }
  if (sessionKind === "hardPageLoad" && cameraFocusPersonRequest) {
    return { kind: "selectedPersonFocus", personId: cameraFocusPersonRequest };
  }
  if (restoredCameraSnapshot) {
    return { kind: "restoreSavedCamera", snapshot: restoredCameraSnapshot };
  }
  return { kind: "frameAll" };
};

/** True once R3F camera + OrbitControls exist and the person (if any) has a layout position. */
export const areCameraControlsAndPersonPositionReady = ({
  hasPerspectiveCamera,
  hasOrbitControls,
  personId,
  visiblePersonIds
}: {
  hasPerspectiveCamera: boolean;
  hasOrbitControls: boolean;
  personId: string | null;
  visiblePersonIds: ReadonlySet<string>;
}) => {
  if (!hasPerspectiveCamera || !hasOrbitControls) {
    return false;
  }
  if (!personId) {
    return true;
  }
  return visiblePersonIds.has(personId);
};

/** Eligible persisted camera blob for canvas restore (alias of restore resolution for naming parity with the plan). */
export const resolvePersistedCameraSnapshot = resolveRestoredCameraSnapshotForCanvas;

/** True after a focus pose was applied for the same person id as the pending camera-focus request. */
export const shouldConsumeCameraFocusRequest = ({
  requestPersonId,
  appliedPersonId
}: {
  requestPersonId: string | null;
  appliedPersonId: string | null;
}) => Boolean(requestPersonId && appliedPersonId && requestPersonId === appliedPersonId);

/**
 * After graph data is ready, stop waiting for a layout position when the target person is not in the graph model
 * (deleted / filtered out) so we can fall back to saved camera or frame-all.
 */
export const shouldGiveUpFocusWaitForMissingGraphPerson = ({
  graphModelReady,
  personId,
  knownPersonIds
}: {
  graphModelReady: boolean;
  personId: string;
  knownPersonIds: ReadonlySet<string>;
}) => graphModelReady && !knownPersonIds.has(personId);

/**
 * Canvas may only apply the one-shot persisted snapshot restore when startup policy is literally "restore saved".
 * Prevents `GraphCanvasScene` from fighting orchestrator-driven focus when startup is focus/frame-all.
 */
export const shouldCanvasApplyPersistedSnapshotRestore = (
  startupIntent: StartupCameraIntent,
  initialCameraState: GraphCameraPose | null
): boolean => initialCameraState != null && startupIntent.kind === "restoreSavedCamera";

export const resolveCameraSnapshotForPersistence = ({
  canPersistCamera,
  liveCamera,
  baseCamera,
  baseCameraIntent,
  baseCameraPersonId,
  focusPersonId,
  selectedPersonId,
  pendingStartupIntent,
  keyboardIntent
}: {
  canPersistCamera: boolean;
  liveCamera: { position: Vector3Tuple; target: Vector3Tuple } | null;
  baseCamera: GraphUiSnapshot["camera"];
  baseCameraIntent: GraphCameraIntent;
  baseCameraPersonId: string | null;
  focusPersonId: string | null;
  selectedPersonId: string | null;
  pendingStartupIntent: GraphCameraIntent | null;
  keyboardIntent: GraphCameraIntent | null;
}): Pick<GraphUiSnapshot, "camera" | "cameraIntent" | "cameraPersonId"> => {
  const contextualPersonId = focusPersonId ?? selectedPersonId ?? baseCameraPersonId ?? null;
  if (canPersistCamera && liveCamera) {
    const cameraIntent = pendingStartupIntent ?? keyboardIntent ?? "manual";
    return {
      camera: liveCamera,
      cameraIntent,
      cameraPersonId: contextualPersonId
    };
  }
  return {
    camera: baseCamera,
    cameraIntent: baseCameraIntent,
    cameraPersonId: baseCameraPersonId ?? focusPersonId ?? selectedPersonId ?? null
  };
};
