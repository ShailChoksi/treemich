import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { defaultGraphFilterVisibility } from "./relationshipStyles";
import { GraphLayerControls } from "./GraphLayerControls";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("GraphLayerControls", () => {
  it("renders Focus mode toggle disabled when Focus cannot be enabled", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GraphLayerControls
          filterVisibility={defaultGraphFilterVisibility}
          onToggleFilter={vi.fn()}
          showFocusMode={false}
          onShowFocusModeChange={vi.fn()}
          canEnableFocus={false}
        />
      );
    });

    expect(container.textContent).toContain("Focus mode");
    const focusInput = container.querySelector(
      ".graph-focus-mode-toggle input"
    ) as HTMLInputElement | null;
    expect(focusInput).not.toBeNull();
    expect(focusInput?.disabled).toBe(true);
    expect(focusInput?.checked).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders Focus mode toggle enabled when a person can root the cone", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GraphLayerControls
          filterVisibility={defaultGraphFilterVisibility}
          onToggleFilter={vi.fn()}
          showFocusMode={true}
          onShowFocusModeChange={vi.fn()}
          canEnableFocus={true}
        />
      );
    });

    const focusInput = container.querySelector(
      ".graph-focus-mode-toggle input"
    ) as HTMLInputElement | null;
    expect(focusInput?.disabled).toBe(false);
    expect(focusInput?.checked).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
