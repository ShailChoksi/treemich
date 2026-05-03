import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { defaultGraphFilterVisibility } from "./relationshipStyles";
import { GraphLayerControls } from "./GraphLayerControls";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("GraphLayerControls", () => {
  it("does not render the single-family-tree checkbox", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GraphLayerControls filterVisibility={defaultGraphFilterVisibility} onToggleFilter={vi.fn()} />
      );
    });

    expect(container.textContent).not.toContain("Show only one family tree");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
