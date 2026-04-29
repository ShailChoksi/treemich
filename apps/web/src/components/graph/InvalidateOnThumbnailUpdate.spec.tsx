import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const invalidate = vi.fn();

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (s: { invalidate: typeof invalidate }) => unknown) => selector({ invalidate })
}));

import { InvalidateOnThumbnailUpdate } from "./useThumbnailLoader";

const reactTestEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnv.IS_REACT_ACT_ENVIRONMENT = true;

describe("InvalidateOnThumbnailUpdate", () => {
  afterEach(() => {
    invalidate.mockClear();
    document.body.innerHTML = "";
  });

  it("does not call invalidate on mount when the texture count does not grow", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const textures = new Map([["p1", {}]]);

    await act(async () => {
      root.render(createElement(InvalidateOnThumbnailUpdate, { thumbnailTextures: textures, visible: true }));
    });

    expect(invalidate).not.toHaveBeenCalled();
    root.unmount();
  });

  it("calls invalidate when the texture map grows and the graph is visible", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(InvalidateOnThumbnailUpdate, { thumbnailTextures: new Map(), visible: true })
      );
    });
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        createElement(InvalidateOnThumbnailUpdate, {
          thumbnailTextures: new Map([["a", {}]]),
          visible: true
        })
      );
    });
    expect(invalidate).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        createElement(InvalidateOnThumbnailUpdate, {
          thumbnailTextures: new Map([
            ["a", {}],
            ["b", {}]
          ]),
          visible: true
        })
      );
    });
    expect(invalidate).toHaveBeenCalledTimes(2);
    root.unmount();
  });

  it("does not call invalidate when the graph is not visible", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(InvalidateOnThumbnailUpdate, { thumbnailTextures: new Map(), visible: false })
      );
    });

    await act(async () => {
      root.render(
        createElement(InvalidateOnThumbnailUpdate, {
          thumbnailTextures: new Map([["a", {}]]),
          visible: false
        })
      );
    });
    expect(invalidate).not.toHaveBeenCalled();
    root.unmount();
  });

  it("does not call invalidate when the texture count shrinks", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(InvalidateOnThumbnailUpdate, {
          thumbnailTextures: new Map([
            ["a", {}],
            ["b", {}]
          ]),
          visible: true
        })
      );
    });
    invalidate.mockClear();

    await act(async () => {
      root.render(
        createElement(InvalidateOnThumbnailUpdate, {
          thumbnailTextures: new Map([["a", {}]]),
          visible: true
        })
      );
    });
    expect(invalidate).not.toHaveBeenCalled();
    root.unmount();
  });
});
