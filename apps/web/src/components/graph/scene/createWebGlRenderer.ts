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

type CanvasGlFactory = Exclude<CanvasProps["gl"], undefined | string>;
type CanvasGlFactoryArg = Parameters<CanvasGlFactory>[0];

export const createWebGlRenderer = (defaults: CanvasGlFactoryArg) => {
  const canvas = defaults.canvas as HTMLCanvasElement;
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
