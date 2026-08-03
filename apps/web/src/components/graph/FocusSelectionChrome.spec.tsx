import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { FocusSelectionChrome } from "./FocusSelectionChrome";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("FocusSelectionChrome", () => {
  it("renders depth steppers and lock control", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onToggleLock = vi.fn();

    act(() => {
      root.render(
        <FocusSelectionChrome
          ancestorDepth={3}
          descendantDepth={3}
          collateralDepth={0}
          locked={false}
          lockedAnchorLabel={null}
          onAncestorDepthChange={vi.fn()}
          onDescendantDepthChange={vi.fn()}
          onCollateralDepthChange={vi.fn()}
          onToggleLock={onToggleLock}
        />
      );
    });

    expect(container.textContent).toContain("Up");
    expect(container.textContent).toContain("Down");
    expect(container.textContent).toContain("Collateral");
    expect(container.textContent).toContain("Lock anchor");

    const lockButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Lock anchor")
    );
    act(() => {
      lockButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToggleLock).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
