import { act, createElement as h, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGraphCameraOrchestrator } from "./useGraphCameraOrchestrator";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const Harness = ({
  focusPersonById,
  onCameraFocusPersonConsumed
}: {
  focusPersonById: (id: string) => void;
  onCameraFocusPersonConsumed: () => void;
}) => {
  const cameraRef = useRef({} as unknown as PerspectiveCamera);
  const orbitControlsRef = useRef({} as unknown as OrbitControlsImpl);
  const lastAutoCenteredFocusPersonIdRef = useRef<string | null>(null);

  useGraphCameraOrchestrator({
    graphCameraSessionKind: "hardPageLoad",
    startupIntent: { kind: "selectedPersonFocus", personId: "ghost" },
    focusPersonRequest: null,
    cameraFocusPersonRequest: null,
    visiblePositionsById: new Map(),
    graphBounds: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] },
    graphModelReady: true,
    knownPersonIds: new Set(["p1"]),
    fallbackSavedCamera: null,
    focusPersonById,
    frameAllNodes: vi.fn(),
    applyPersistedCameraPose: vi.fn(),
    onCameraFocusPersonConsumed,
    onFocusPersonConsumed: vi.fn(),
    setFocusPersonId: vi.fn(),
    cameraRef,
    orbitControlsRef,
    canvasCameraReadyGeneration: 1,
    lastAutoCenteredFocusPersonIdRef
  });

  return null;
};

describe("useGraphCameraOrchestrator", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("consumes startup camera focus without focusPersonById when the target is missing from the graph model", async () => {
    const focusPersonById = vi.fn();
    const onCameraFocusPersonConsumed = vi.fn();
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(h(Harness, { focusPersonById, onCameraFocusPersonConsumed }));
    });

    expect(onCameraFocusPersonConsumed).toHaveBeenCalledTimes(1);
    expect(focusPersonById).not.toHaveBeenCalled();
  });
});
