import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGraphCamera } from "./useGraphCamera";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const Harness = ({
  frameAllNodes,
  focusActiveNode,
  topDownView
}: {
  frameAllNodes: () => void;
  focusActiveNode: () => void;
  topDownView: () => void;
}) => {
  useGraphCamera({
    enabled: true,
    frameAllNodes,
    focusActiveNode,
    topDownView
  });
  return null;
};

describe("useGraphCamera", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const mount = async (props: {
    frameAllNodes: () => void;
    focusActiveNode: () => void;
    topDownView: () => void;
  }) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => {
      root.render(h(Harness, props));
    });
    return root;
  };

  it("invokes frameAllNodes when f is pressed on a graph-safe target", async () => {
    const frameAllNodes = vi.fn();
    const focusActiveNode = vi.fn();
    const topDownView = vi.fn();
    await mount({ frameAllNodes, focusActiveNode, topDownView });
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
    });
    expect(frameAllNodes).toHaveBeenCalledTimes(1);
    expect(focusActiveNode).not.toHaveBeenCalled();
    expect(topDownView).not.toHaveBeenCalled();
  });

  it("invokes focusActiveNode when g is pressed", async () => {
    const frameAllNodes = vi.fn();
    const focusActiveNode = vi.fn();
    const topDownView = vi.fn();
    await mount({ frameAllNodes, focusActiveNode, topDownView });
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    });
    expect(focusActiveNode).toHaveBeenCalledTimes(1);
  });

  it("invokes topDownView when t is pressed", async () => {
    const frameAllNodes = vi.fn();
    const focusActiveNode = vi.fn();
    const topDownView = vi.fn();
    await mount({ frameAllNodes, focusActiveNode, topDownView });
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true }));
    });
    expect(topDownView).toHaveBeenCalledTimes(1);
  });
});
