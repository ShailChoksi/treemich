import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportsWorkspace } from "./ReportsWorkspace";

const apiMocks = vi.hoisted(() => ({
  fetchPedigreeReport: vi.fn(),
  fetchDescendantReport: vi.fn(),
  fetchFamilyGroupSheetReport: vi.fn(),
  fetchRegisterReport: vi.fn(),
  getFamilies: vi.fn(),
  getFamiliesForPerson: vi.fn()
}));

vi.mock("../../lib/api", () => apiMocks);

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const renderWorkspace = (): { container: HTMLDivElement; root: Root } => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ReportsWorkspace
        selectedPersonId="p1"
        people={[
          { id: "p1", name: "Root Person" },
          { id: "p2", name: "Other Person" }
        ]}
      />
    );
  });
  return { container, root };
};

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("ReportsWorkspace", () => {
  it("defaults to selected person and generates a pedigree report", async () => {
    apiMocks.getFamiliesForPerson.mockResolvedValue([]);
    apiMocks.fetchPedigreeReport.mockResolvedValue({
      type: "pedigree",
      generatedAt: "2026-04-29T00:00:00.000Z",
      parameters: { rootPersonId: "p1", depth: 4, redactLiving: false },
      warnings: [],
      root: {
        id: "p1",
        displayName: "Root Person",
        gender: "UNKNOWN",
        primaryName: null,
        alternateNames: [],
        isLiving: true,
        isRedacted: false,
        events: []
      },
      generations: [{ generation: 0, people: [] }],
      edges: []
    });

    const { container, root } = renderWorkspace();
    await act(async () => {});

    const generate = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Generate report")
    );
    await act(async () => {
      generate?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(apiMocks.fetchPedigreeReport).toHaveBeenCalledWith("p1", { depth: 4, redactLiving: false });
    expect(container.textContent).toContain("Pedigree chart");

    act(() => root.unmount());
  });

  it("loads selected-person families for family group reports", async () => {
    apiMocks.getFamiliesForPerson.mockResolvedValue([
      {
        id: "fam1",
        parent1PersonId: "p1",
        parent2PersonId: "p2",
        children: [],
        notes: null,
        userId: "u1",
        externalIds: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    const { root } = renderWorkspace();
    await act(async () => {});

    expect(apiMocks.getFamiliesForPerson).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    act(() => root.unmount());
  });
});
