import { describe, expect, it } from "vitest";
import { computeCameraVisibility, resolveVisibilityBucket } from "./graphVisibility";

describe("graphVisibility helpers", () => {
  it("keeps nodes in near bucket until exit radius", () => {
    const near = resolveVisibilityBucket({
      distanceSq: 25 * 25,
      previousBucket: "near"
    });
    const mid = resolveVisibilityBucket({
      distanceSq: 31 * 31,
      previousBucket: "near"
    });
    expect(near).toBe("near");
    expect(mid).toBe("mid");
  });

  it("keeps nodes in far bucket until far exit radius", () => {
    const stillFar = resolveVisibilityBucket({
      distanceSq: 150 * 150,
      previousBucket: "far"
    });
    const culled = resolveVisibilityBucket({
      distanceSq: 176 * 176,
      previousBucket: "far"
    });
    expect(stillFar).toBe("far");
    expect(culled).toBe("culled");
  });

  it("force-includes prioritized ids even when distance bucket is culled", () => {
    const visibility = computeCameraVisibility({
      displayPeople: [
        { personId: "near", displayPosition: [0, 0, 0] },
        { personId: "far-priority", displayPosition: [200, 0, 0] }
      ],
      cameraPosition: [0, 0, 0],
      prioritizedNodeIds: new Set(["far-priority"]),
      previousBuckets: new Map()
    });
    expect(visibility.bucketByPersonId.get("near")).toBe("near");
    expect(visibility.bucketByPersonId.get("far-priority")).toBe("culled");
    expect(visibility.renderVisibleIdSet.has("near")).toBe(true);
    expect(visibility.renderVisibleIdSet.has("far-priority")).toBe(true);
  });
});
