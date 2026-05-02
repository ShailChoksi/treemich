import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonRecord } from "../../lib/api";
import { GraphSearchOverlay } from "./GraphSearchOverlay";

const person = (partial: Partial<PersonRecord> & Pick<PersonRecord, "id" | "name">): PersonRecord =>
  partial as PersonRecord;

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
        people={[person({ id: "person-1", name: "Alex" })]}
        searchFeedback={null}
        treeValidationIssueCount={null}
        treeValidationEngineDisabled={false}
        providerFilter="all"
        onProviderFilterChange={() => undefined}
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
  it("exposes onboarding anchors for relationship search and new person", () => {
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
          people={[]}
          searchFeedback={null}
          treeValidationIssueCount={null}
          treeValidationEngineDisabled={false}
          providerFilter="all"
          onProviderFilterChange={() => undefined}
          onNewPerson={() => undefined}
        />
      );
    });

    expect(container.querySelector('[data-onboarding-target="relationship-search"]')).not.toBeNull();
    expect(container.querySelector('[data-onboarding-target="new-person"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

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
    const people = Array.from({ length: 120 }, (_, index) =>
      person({
        id: `person-${index}`,
        name: `Person ${String(index).padStart(3, "0")}`
      })
    );
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
          providerFilter="all"
          onProviderFilterChange={() => undefined}
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
            person({ id: "standalone-1", name: "Standalone Person" }),
            person({ id: "immich-1", name: "Immich Person" })
          ]}
          searchFeedback={null}
          treeValidationIssueCount={null}
          treeValidationEngineDisabled={false}
          providerFilter="all"
          onProviderFilterChange={() => undefined}
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

  it("notifies when linked status filter changes", () => {
    const onProviderFilterChange = vi.fn();
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
          people={[person({ id: "person-1", name: "Alex" })]}
          searchFeedback={null}
          treeValidationIssueCount={null}
          treeValidationEngineDisabled={false}
          providerFilter="all"
          onProviderFilterChange={onProviderFilterChange}
        />
      );
    });

    const select = container.querySelector(".graph-search-provider-filter select") as HTMLSelectElement;
    act(() => {
      select.value = "unlinked";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onProviderFilterChange).toHaveBeenCalledWith("unlinked");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("includes Immich identity display names as search suggestion aliases", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GraphSearchOverlay
          searchTerm="emma"
          onSearchTermChange={() => undefined}
          onSearchSubmit={(event) => event.preventDefault()}
          onClearSearch={() => undefined}
          onCenterView={() => undefined}
          people={[
            person({
              id: "p1",
              name: "Jane Doe",
              displayName: "Jane D.",
              externalIdentities: [
                {
                  id: "ext-1",
                  personId: "p1",
                  provider: "IMMICH",
                  providerPersonId: "im-1",
                  providerBaseUrl: "https://immich.test/api",
                  displayName: "Emma From Immich",
                  thumbnailImportedAt: null,
                  lastSeenAt: null,
                  metadata: {},
                  createdAt: "2026-01-01T00:00:00.000Z",
                  updatedAt: "2026-01-01T00:00:00.000Z"
                }
              ]
            })
          ]}
          searchFeedback={null}
          treeValidationIssueCount={null}
          treeValidationEngineDisabled={false}
          providerFilter="all"
          onProviderFilterChange={() => undefined}
        />
      );
    });

    const options = [...container.querySelectorAll<HTMLOptionElement>("datalist option")].map(
      (option) => option.value
    );
    expect(options).toContain("Emma From Immich");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not render the alternate-name preference checkbox", () => {
    const { container, root } = renderOverlay();

    expect(container.textContent).not.toContain("Match alternate Treemich names");
    expect(container.querySelector(".graph-search-alt-names")).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
