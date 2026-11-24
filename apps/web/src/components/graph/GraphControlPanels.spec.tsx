import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTreeLayoutPreferences } from "@treemich/shared";
import { GraphFiltersToggle, useGraphControlPanels } from "./GraphControlPanels";
import { TreeLayoutControls } from "./TreeLayoutControls";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

/** Mirrors how PeopleGraph3D and GuestPeopleGraph3D wire the toolbar toggle, filters panel and layout panel. */
const Harness = () => {
  const { filtersOpen, layoutExpanded, toggleFilters, setLayoutExpanded } = useGraphControlPanels();
  return createElement(
    "div",
    null,
    createElement(
      "div",
      {
        id: "filters-panel",
        "data-testid": "filters-panel",
        "data-open": String(filtersOpen)
      },
      "filters"
    ),
    createElement(GraphFiltersToggle, {
      expanded: filtersOpen,
      controlsId: "filters-panel",
      onToggle: toggleFilters
    }),
    createElement(TreeLayoutControls, {
      value: defaultTreeLayoutPreferences,
      onPreferenceChange: vi.fn(),
      onPreferenceReset: vi.fn(),
      expanded: layoutExpanded,
      onExpandedChange: setLayoutExpanded
    })
  );
};

const renderHarness = (): { container: HTMLDivElement; root: Root } => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(Harness));
  });
  return { container, root };
};

const filtersToggle = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>("button.graph-filters-toggle")!;
const filtersPanelOpen = (container: HTMLElement) =>
  container.querySelector('[data-testid="filters-panel"]')?.getAttribute("data-open") === "true";
const layoutToggle = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>("button.tree-layout-controls-toggle")!;

describe("graph control panels", () => {
  it("starts with both panels closed and the filters toggle pointing at its panel", () => {
    const { container, root } = renderHarness();

    expect(filtersToggle(container).getAttribute("aria-controls")).toBe("filters-panel");
    expect(filtersToggle(container).getAttribute("aria-expanded")).toBe("false");
    expect(filtersToggle(container).textContent).toBe("Filters");
    expect(filtersPanelOpen(container)).toBe(false);
    expect(layoutToggle(container).getAttribute("aria-expanded")).toBe("false");

    act(() => root.unmount());
  });

  it("toggles the filters panel open and closed", () => {
    const { container, root } = renderHarness();

    act(() => filtersToggle(container).click());
    expect(filtersPanelOpen(container)).toBe(true);
    expect(filtersToggle(container).getAttribute("aria-expanded")).toBe("true");
    expect(filtersToggle(container).textContent).toBe("Hide filters");

    act(() => filtersToggle(container).click());
    expect(filtersPanelOpen(container)).toBe(false);

    act(() => root.unmount());
  });

  it("keeps only one panel open so they never stack on a small screen", () => {
    const { container, root } = renderHarness();

    act(() => filtersToggle(container).click());
    act(() => layoutToggle(container).click());
    expect(layoutToggle(container).getAttribute("aria-expanded")).toBe("true");
    expect(filtersPanelOpen(container)).toBe(false);

    act(() => filtersToggle(container).click());
    expect(filtersPanelOpen(container)).toBe(true);
    expect(layoutToggle(container).getAttribute("aria-expanded")).toBe("false");

    act(() => root.unmount());
  });

  it("closing the layout panel does not reopen or close the filters panel", () => {
    const { container, root } = renderHarness();

    act(() => layoutToggle(container).click());
    act(() => layoutToggle(container).click());
    expect(layoutToggle(container).getAttribute("aria-expanded")).toBe("false");
    expect(filtersPanelOpen(container)).toBe(false);

    act(() => root.unmount());
  });
});
