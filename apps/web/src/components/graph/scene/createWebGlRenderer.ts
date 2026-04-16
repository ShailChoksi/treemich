import type { CanvasProps } from "@react-three/fiber";
import { WebGLRenderer } from "three";

const webglContextAttributes: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: true,
  desynchronized: false,
  failIfMajorPerformanceCaveat: false,
  powerPreference: "default",
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  stencil: false
};

type CanvasGlFactory = Extract<NonNullable<CanvasProps["gl"]>, (...args: never[]) => unknown>;
type WebGl2Canvas = {
  getContext: (contextId: "webgl2", options?: WebGLContextAttributes) => WebGL2RenderingContext | null;
};

const hasWebGl2ContextGetter = (canvas: unknown): canvas is WebGl2Canvas => {
  if (!canvas || typeof canvas !== "object") {
    return false;
  }
  const candidate = canvas as { getContext?: unknown };
  return typeof candidate.getContext === "function";
};

export const createWebGlRenderer: CanvasGlFactory = (defaults) => {
  if (!hasWebGl2ContextGetter(defaults.canvas)) {
    throw new Error("Canvas does not support WebGL2 context creation.");
  }
  const canvas = defaults.canvas;
  const context =
    // three@0.180 requires WebGL2, so only request webgl2 contexts.
    canvas.getContext("webgl2") ?? canvas.getContext("webgl2", webglContextAttributes);

  if (!context) {
    throw new Error(
      "WebGL2 context creation failed: browser/driver returned no context. Enable WebGL2/hardware acceleration in Firefox."
    );
  }

  return new WebGLRenderer({
    ...defaults,
    context: context as WebGL2RenderingContext
  });
};
