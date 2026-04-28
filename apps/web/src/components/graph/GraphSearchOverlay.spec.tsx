import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphSearchOverlay } from "./GraphSearchOverlay";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

type RenderResult = {
  container: HTMLDivElement;
  root: Root;
};

const renderOverlay = (onCenterView = vi.fn()): RenderResult => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <GraphSearchOverlay
        searchTerm=""
        onSearchTermChange={() => undefined}
        onSearchSubmit={(event) => event.preventDefault()}
        onClearSearch={() => undefined}
        onCenterView={onCenterView}
        people={[{ id: "person-1", name: "Alex" }]}
        searchFeedback={null}
        treeValidationIssueCount={null}
        treeValidationEngineDisabled={false}
        searchIncludeAlternateNames={false}
        onSearchIncludeAlternateNamesChange={() => undefined}
      />
    );
  });

  return { container, root };
};

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("GraphSearchOverlay", () => {
  it("renders a center view button with an accessible label", () => {
    const { container, root } = renderOverlay();

    const centerButton = container.querySelector('button[aria-label="Center graph view"]');
    expect(centerButton).toBeTruthy();
    expect(centerButton?.textContent).toContain("Center view");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("invokes center view callback when clicked", () => {
    const onCenterView = vi.fn();
    const { container, root } = renderOverlay(onCenterView);
    const centerButton = container.querySelector('button[aria-label="Center graph view"]');
    expect(centerButton).toBeTruthy();

    act(() => {
      centerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCenterView).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("limits datalist options to a bounded list", () => {
    const people = Array.from({ length: 120 }, (_, index) => ({
      id: `person-${index}`,
      name: `Person ${String(index).padStart(3, "0")}`
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GraphSearchOverlay
          searchTerm=""
          onSearchTermChange={() => undefined}
          onSearchSubmit={(event) => event.preventDefault()}
          onClearSearch={() => undefined}
          onCenterView={() => undefined}
          people={people}
          searchFeedback={null}
          treeValidationIssueCount={null}
          treeValidationEngineDisabled={false}
          searchIncludeAlternateNames={false}
          onSearchIncludeAlternateNamesChange={() => undefined}
        />
      );
    });

    expect(container.querySelectorAll("datalist option").length).toBeLessThanOrEqual(80);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("includes standalone Treemich people in search suggestions", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GraphSearchOverlay
          searchTerm="stand"
          onSearchTermChange={() => undefined}
          onSearchSubmit={(event) => event.preventDefault()}
          onClearSearch={() => undefined}
          onCenterView={() => undefined}
          people={[
            { id: "standalone-1", name: "Standalone Person" },
            { id: "immich-1", name: "Immich Person" }
          ]}
          searchFeedback={null}
          treeValidationIssueCount={null}
          treeValidationEngineDisabled={false}
          searchIncludeAlternateNames={false}
          onSearchIncludeAlternateNamesChange={() => undefined}
        />
      );
    });

    const options = [...container.querySelectorAll<HTMLOptionElement>("datalist option")].map(
      (option) => option.value
    );
    expect(options).toContain("Standalone Person");
    expect(options).not.toContain("Immich Person");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
