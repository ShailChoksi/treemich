import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTreeLayoutPreferences } from "@treemich/shared";
import { TreeLayoutControls } from "./TreeLayoutControls";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const renderControls = (
  props: Partial<Parameters<typeof TreeLayoutControls>[0]> = {}
): { container: HTMLDivElement; root: Root } => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(TreeLayoutControls, {
        value: defaultTreeLayoutPreferences,
        onPreferenceChange: vi.fn(),
        onPreferenceReset: vi.fn(),
        ...props
      })
    );
  });
  return { container, root };
};

describe("TreeLayoutControls", () => {
  it("starts minimized and expands on demand", () => {
    const { container, root } = renderControls();
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="Expand tree layout controls"]');

    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(0);

    act(() => toggle!.click());
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Collapse tree layout controls"]')).toBeTruthy();
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(4);

    act(() => root.unmount());
  });

  it("renders four percent-labeled sliders when expanded", () => {
    const { container, root } = renderControls({
      value: {
        horizontalSpacing: 0.75,
        verticalSpacing: 1,
        spouseBranchZDistance: 1.25,
        spouseBranchSensitivity: 2
      }
    });
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand tree layout controls"]')!.click());

    expect(container.textContent).toContain("Horizontal spacing");
    expect(container.textContent).toContain("75%");
    expect(container.textContent).toContain("Vertical spacing");
    expect(container.textContent).toContain("100%");
    expect(container.textContent).toContain("Spouse Z distance");
    expect(container.textContent).toContain("125%");
    expect(container.textContent).toContain("Spouse Z branch sensitivity");
    expect(container.textContent).toContain("200%");
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(4);

    act(() => root.unmount());
  });

  it("emits slider changes and per-slider resets", () => {
    const onPreferenceChange = vi.fn();
    const onPreferenceReset = vi.fn();
    const { container, root } = renderControls({
      value: { ...defaultTreeLayoutPreferences, horizontalSpacing: 1.5 },
      onPreferenceChange,
      onPreferenceReset
    });
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand tree layout controls"]')!.click());
    const horizontal = container.querySelector<HTMLInputElement>('input[aria-label="Horizontal spacing"]');
    expect(horizontal).toBeTruthy();

    act(() => {
      horizontal!.value = "1.5";
      horizontal!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPreferenceChange).toHaveBeenCalledWith("horizontalSpacing", 1.5);

    const reset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset Horizontal spacing"]');
    expect(reset).toBeTruthy();
    act(() => reset!.click());
    expect(onPreferenceReset).toHaveBeenCalledWith("horizontalSpacing");

    act(() => root.unmount());
  });

  it("disables controls outside family tree mode", () => {
    const onPreferenceChange = vi.fn();
    const { container, root } = renderControls({
      disabled: true,
      disabledReason: "Tree layout controls are only available in family Tree view.",
      onPreferenceChange
    });
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Expand tree layout controls"]')!.click());

    expect(container.textContent).toContain("Tree layout controls are only available in family Tree view.");
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input[type="range"]')].every(
        (input) => input.disabled
      )
    ).toBe(true);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Reset"]')].every(
        (button) => button.disabled
      )
    ).toBe(true);

    act(() => root.unmount());
  });
});
