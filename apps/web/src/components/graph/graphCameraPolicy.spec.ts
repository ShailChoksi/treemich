import { afterEach, describe, expect, it, vi } from "vitest";
import {
  areCameraControlsAndPersonPositionReady,
  consumeGraphCameraSessionKindFromBrowser,
  resolveCameraSnapshotForPersistence,
  resolvePersistedCameraSnapshot,
  resolveRestoredCameraSnapshotForCanvas,
  resolveStartupCameraIntent,
  shouldCanvasApplyPersistedSnapshotRestore,
  shouldConsumeCameraFocusRequest,
  shouldGiveUpFocusWaitForMissingGraphPerson,
  type StartupCameraIntent
} from "./graphCameraPolicy";

describe("graphCameraPolicy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("on hard page load, selected-person focus request suppresses restoring a saved camera snapshot", () => {
    const saved = { position: [100, 100, 100] as const, target: [0, 0, 0] as const };
    expect(
      resolveRestoredCameraSnapshotForCanvas({
        sessionKind: "hardPageLoad",
        explicitFocusPersonId: null,
        cameraFocusPersonRequest: "p1",
        savedCamera: saved
      })
    ).toBeNull();
  });

  it("explicit search/profile focus suppresses restoring a saved camera snapshot", () => {
    const saved = { position: [1, 2, 3] as const, target: [0, 0, 0] as const };
    expect(
      resolveRestoredCameraSnapshotForCanvas({
        sessionKind: "workspaceRemount",
        explicitFocusPersonId: "p9",
        cameraFocusPersonRequest: null,
        savedCamera: saved
      })
    ).toBeNull();
  });

  it("resolveStartupCameraIntent prefers explicit focus over first-load selected focus", () => {
    const saved = { position: [1, 2, 3] as const, target: [0, 0, 0] as const };
    expect(
      resolveStartupCameraIntent({
        sessionKind: "hardPageLoad",
        explicitFocusPersonId: "p9",
        cameraFocusPersonRequest: "p1",
        restoredCameraSnapshot: saved
      })
    ).toEqual({ kind: "explicitFocus", personId: "p9" });
  });

  it("resolveStartupCameraIntent uses saved camera on workspace remount when explicit focus is absent", () => {
    const saved = { position: [1, 2, 3] as const, target: [0, 0, 0] as const };
    expect(
      resolveStartupCameraIntent({
        sessionKind: "workspaceRemount",
        explicitFocusPersonId: null,
        cameraFocusPersonRequest: "p1",
        restoredCameraSnapshot: saved
      })
    ).toEqual({ kind: "restoreSavedCamera", snapshot: saved });
  });

  it("areCameraControlsAndPersonPositionReady is false until both camera and controls exist", () => {
    expect(
      areCameraControlsAndPersonPositionReady({
        hasPerspectiveCamera: false,
        hasOrbitControls: true,
        personId: "p1",
        visiblePersonIds: new Set(["p1"])
      })
    ).toBe(false);
    expect(
      areCameraControlsAndPersonPositionReady({
        hasPerspectiveCamera: true,
        hasOrbitControls: true,
        personId: "p1",
        visiblePersonIds: new Set()
      })
    ).toBe(false);
  });

  it("consumeGraphCameraSessionKindFromBrowser returns hard once per tab session then remount", () => {
    expect(consumeGraphCameraSessionKindFromBrowser()).toBe("hardPageLoad");
    expect(consumeGraphCameraSessionKindFromBrowser()).toBe("workspaceRemount");
  });

  it("consumeGraphCameraSessionKindFromBrowser resets on reload navigation", () => {
    vi.stubGlobal("performance", {
      getEntriesByType: () => [{ type: "reload" }]
    });
    sessionStorage.setItem("treemich.graph.camera.hardBootstrapConsumed", "1");
    expect(consumeGraphCameraSessionKindFromBrowser()).toBe("hardPageLoad");
  });

  it("resolvePersistedCameraSnapshot matches resolveRestoredCameraSnapshotForCanvas", () => {
    const saved = { position: [1, 2, 3] as const, target: [0, 0, 0] as const };
    const input = {
      sessionKind: "hardPageLoad" as const,
      explicitFocusPersonId: null,
      cameraFocusPersonRequest: "p1",
      savedCamera: saved
    };
    expect(resolvePersistedCameraSnapshot(input)).toEqual(resolveRestoredCameraSnapshotForCanvas(input));
  });

  it("shouldConsumeCameraFocusRequest is true only when applied id matches request", () => {
    expect(shouldConsumeCameraFocusRequest({ requestPersonId: "a", appliedPersonId: "a" })).toBe(true);
    expect(shouldConsumeCameraFocusRequest({ requestPersonId: "a", appliedPersonId: "b" })).toBe(false);
    expect(shouldConsumeCameraFocusRequest({ requestPersonId: null, appliedPersonId: "a" })).toBe(false);
  });

  it("shouldGiveUpFocusWaitForMissingGraphPerson is true when model is ready and person is absent", () => {
    expect(
      shouldGiveUpFocusWaitForMissingGraphPerson({
        graphModelReady: true,
        personId: "ghost",
        knownPersonIds: new Set(["p1"])
      })
    ).toBe(true);
    expect(
      shouldGiveUpFocusWaitForMissingGraphPerson({
        graphModelReady: false,
        personId: "ghost",
        knownPersonIds: new Set(["p1"])
      })
    ).toBe(false);
  });

  it("resolveStartupCameraIntent uses first-load selected focus when hard load omits saved restore", () => {
    expect(
      resolveStartupCameraIntent({
        sessionKind: "hardPageLoad",
        explicitFocusPersonId: null,
        cameraFocusPersonRequest: "p1",
        restoredCameraSnapshot: null
      })
    ).toEqual({ kind: "selectedPersonFocus", personId: "p1" });
  });

  it("resolveStartupCameraIntent frames all when nothing else applies", () => {
    expect(
      resolveStartupCameraIntent({
        sessionKind: "hardPageLoad",
        explicitFocusPersonId: null,
        cameraFocusPersonRequest: null,
        restoredCameraSnapshot: null
      })
    ).toEqual({ kind: "frameAll" });
  });

  it("shouldCanvasApplyPersistedSnapshotRestore is true only for restore-saved startup with a snapshot", () => {
    const saved = { position: [1, 2, 3] as const, target: [0, 0, 0] as const };
    const restoreIntent: StartupCameraIntent = { kind: "restoreSavedCamera", snapshot: saved };
    expect(shouldCanvasApplyPersistedSnapshotRestore(restoreIntent, saved)).toBe(true);
    expect(shouldCanvasApplyPersistedSnapshotRestore(restoreIntent, null)).toBe(false);
    expect(
      shouldCanvasApplyPersistedSnapshotRestore({ kind: "selectedPersonFocus", personId: "p1" }, saved)
    ).toBe(false);
  });

  it("resolveCameraSnapshotForPersistence preserves base camera when canPersist is false (pre-mount)", () => {
    const base = {
      baseCamera: {
        position: [9, 9, 9] as [number, number, number],
        target: [0, 0, 0] as [number, number, number]
      },
      baseCameraIntent: "manual" as const,
      baseCameraPersonId: "p1" as string | null
    };
    expect(
      resolveCameraSnapshotForPersistence({
        canPersistCamera: false,
        liveCamera: null,
        ...base,
        focusPersonId: null,
        selectedPersonId: null,
        pendingStartupIntent: null,
        keyboardIntent: null
      })
    ).toEqual({
      camera: base.baseCamera,
      cameraIntent: "manual",
      cameraPersonId: "p1"
    });
  });

  it("resolveCameraSnapshotForPersistence maps keyboard g to explicitFocus with cameraPersonId", () => {
    const live = {
      position: [1, 2, 3] as [number, number, number],
      target: [0, 0, 0] as [number, number, number]
    };
    expect(
      resolveCameraSnapshotForPersistence({
        canPersistCamera: true,
        liveCamera: live,
        baseCamera: null,
        baseCameraIntent: "frameAll",
        baseCameraPersonId: null,
        focusPersonId: "p9",
        selectedPersonId: null,
        pendingStartupIntent: null,
        keyboardIntent: "explicitFocus"
      })
    ).toEqual({
      camera: live,
      cameraIntent: "explicitFocus",
      cameraPersonId: "p9"
    });
  });

  it("resolveCameraSnapshotForPersistence maps keyboard f to frameAll", () => {
    const live = {
      position: [1, 2, 3] as [number, number, number],
      target: [0, 0, 0] as [number, number, number]
    };
    expect(
      resolveCameraSnapshotForPersistence({
        canPersistCamera: true,
        liveCamera: live,
        baseCamera: null,
        baseCameraIntent: "manual",
        baseCameraPersonId: "p1",
        focusPersonId: null,
        selectedPersonId: "p2",
        pendingStartupIntent: null,
        keyboardIntent: "frameAll"
      })
    ).toEqual({
      camera: live,
      cameraIntent: "frameAll",
      cameraPersonId: "p2"
    });
  });

  it("resolveCameraSnapshotForPersistence maps keyboard t to topDown", () => {
    const live = {
      position: [1, 2, 3] as [number, number, number],
      target: [0, 0, 0] as [number, number, number]
    };
    expect(
      resolveCameraSnapshotForPersistence({
        canPersistCamera: true,
        liveCamera: live,
        baseCamera: null,
        baseCameraIntent: "manual",
        baseCameraPersonId: null,
        focusPersonId: null,
        selectedPersonId: null,
        pendingStartupIntent: null,
        keyboardIntent: "topDown"
      })
    ).toEqual({
      camera: live,
      cameraIntent: "topDown",
      cameraPersonId: null
    });
  });

  it("resolveCameraSnapshotForPersistence prefers pending startup intent over keyboard", () => {
    const live = {
      position: [1, 2, 3] as [number, number, number],
      target: [0, 0, 0] as [number, number, number]
    };
    expect(
      resolveCameraSnapshotForPersistence({
        canPersistCamera: true,
        liveCamera: live,
        baseCamera: null,
        baseCameraIntent: "manual",
        baseCameraPersonId: null,
        focusPersonId: "p1",
        selectedPersonId: null,
        pendingStartupIntent: "selectedFocus",
        keyboardIntent: "explicitFocus"
      })
    ).toEqual({
      camera: live,
      cameraIntent: "selectedFocus",
      cameraPersonId: "p1"
    });
  });
});
