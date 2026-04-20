import { describe, expect, it } from "vitest";
import { useGraphLifecycle } from "./useGraphLifecycle";

describe("useGraphLifecycle", () => {
  it("is a stable function that accepts thumbnailNodeIds without throwing", () => {
    expect(() => {
      useGraphLifecycle({ thumbnailNodeIds: new Set(["a", "b"]) });
    }).not.toThrow();
  });
});
