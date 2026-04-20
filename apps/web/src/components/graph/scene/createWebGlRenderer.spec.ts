import { describe, expect, it, vi } from "vitest";
import { createWebGlRenderer } from "./createWebGlRenderer";

vi.mock("three", () => ({
  WebGLRenderer: vi.fn().mockImplementation((params: unknown) => ({ params }))
}));

describe("createWebGlRenderer", () => {
  it("requests a webgl2 context with explicit attributes on first attempt", () => {
    const context = {} as WebGL2RenderingContext;
    const getContext = vi.fn().mockReturnValue(context);
    const canvas = { getContext };

    createWebGlRenderer({ canvas } as never);

    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledWith(
      "webgl2",
      expect.objectContaining({ powerPreference: "high-performance" })
    );
  });

  it("throws when webgl2 context creation fails", () => {
    const canvas = { getContext: vi.fn().mockReturnValue(null) };

    expect(() => createWebGlRenderer({ canvas } as never)).toThrowError(/WebGL2 context creation failed/i);
  });
});
