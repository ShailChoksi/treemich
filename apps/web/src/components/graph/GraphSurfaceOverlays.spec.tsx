import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphSurfaceOverlays } from "./GraphSurfaceOverlays";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("GraphSurfaceOverlays", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders skeleton loading content for the graph surface", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(GraphSurfaceOverlays, { isLoading: true, loadError: null }));
    });

    expect(container.querySelector(".graph-skeleton")).toBeTruthy();
    expect(container.querySelector("[aria-label='Loading family graph']")).toBeTruthy();
    act(() => {
      root.unmount();
    });
  });

  it("renders retry actions for load and layout failures", async () => {
    const onRetryGraphLoad = vi.fn();
    const onRetryLayout = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(GraphSurfaceOverlays, {
          isLoading: false,
          loadError: "Graph failed",
          onRetryGraphLoad
        })
      );
    });

    const retryGraphButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Retry graph load")
    );
    await act(async () => {
      retryGraphButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRetryGraphLoad).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        createElement(GraphSurfaceOverlays, {
          isLoading: false,
          loadError: null,
          layoutError: "Layout failed",
          onRetryLayout
        })
      );
    });

    const retryLayoutButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Retry layout")
    );
    await act(async () => {
      retryLayoutButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRetryLayout).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
  });
});
