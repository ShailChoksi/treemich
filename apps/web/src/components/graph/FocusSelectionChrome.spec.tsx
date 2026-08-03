import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { FocusSelectionChrome } from "./FocusSelectionChrome";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("FocusSelectionChrome", () => {
  it("renders depth steppers and a lock icon button with tooltip", () => {
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

    expect(container.textContent).toContain("Ancestors");
    expect(container.textContent).toContain("Descendants");
    expect(container.textContent).toContain("Siblings");
    expect(container.textContent).not.toContain("Lock anchor");

    const ancestorLabel = [...container.querySelectorAll("label")].find((label) =>
      label.textContent?.includes("Ancestors")
    );
    expect(ancestorLabel?.getAttribute("title")).toContain("generations of parents");
    const siblingsLabel = [...container.querySelectorAll("label")].find((label) =>
      label.textContent?.includes("Siblings")
    );
    expect(siblingsLabel?.getAttribute("title")).toContain("siblings only");

    const lockButton = container.querySelector("button.graph-focus-lock-button") as HTMLButtonElement | null;
    expect(lockButton).not.toBeNull();
    expect(lockButton?.getAttribute("title")).toBe("Lock Focus on Person");
    expect(lockButton?.getAttribute("aria-label")).toBe("Lock Focus on Person");
    expect(lockButton?.getAttribute("aria-pressed")).toBe("false");
    expect(lockButton?.querySelector("svg")).not.toBeNull();

    act(() => {
      lockButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToggleLock).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <FocusSelectionChrome
          ancestorDepth={3}
          descendantDepth={3}
          collateralDepth={0}
          locked={true}
          lockedAnchorLabel="Ada Lovelace"
          onAncestorDepthChange={vi.fn()}
          onDescendantDepthChange={vi.fn()}
          onCollateralDepthChange={vi.fn()}
          onToggleLock={onToggleLock}
        />
      );
    });

    const lockedButton = container.querySelector(
      "button.graph-focus-lock-button"
    ) as HTMLButtonElement | null;
    expect(lockedButton?.getAttribute("title")).toBe("Lock Focus on Person");
    expect(lockedButton?.getAttribute("aria-pressed")).toBe("true");
    expect(lockedButton?.className).toContain("graph-focus-lock-on");
    expect(lockedButton?.getAttribute("aria-label")).toContain("Ada Lovelace");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
