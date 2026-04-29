import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImmichImportWorkspace } from "./ImmichImportWorkspace";

const apiMocks = vi.hoisted(() => ({
  getImmichImportPreview: vi.fn(),
  importImmichPeople: vi.fn(),
  importImmichThumbnails: vi.fn(),
  importImmichCooccurrence: vi.fn(),
  personThumbnailUrl: (personId: string) => `/api/people/${personId}/thumbnail`,
  ApiHttpError: class ApiHttpError extends Error {
    readonly statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  }
}));

vi.mock("../lib/api", () => apiMocks);

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const renderWorkspace = (): { container: HTMLDivElement; root: Root } => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ImmichImportWorkspace people={[{ id: "p1", name: "Existing Person" }]} />);
  });
  return { container, root };
};

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("ImmichImportWorkspace", () => {
  it("previews Immich people and submits create/link decisions", async () => {
    apiMocks.getImmichImportPreview.mockResolvedValue({
      linked: true,
      people: [
        {
          providerPersonId: "immich-1",
          name: "New Person",
          birthDate: null,
          thumbnailPath: null,
          linkedPersonId: null,
          linkedPersonName: null,
          candidates: []
        }
      ],
      totals: { immichPeople: 1, linkedPeople: 0, unlinkedPeople: 1 }
    });
    apiMocks.importImmichPeople.mockResolvedValue({
      results: [{ providerPersonId: "immich-1", action: "create", personId: "p2", status: "created" }],
      summary: { created: 1, linked: 0, skipped: 0, alreadyLinked: 0, errors: 0, thumbnailsImported: 1 }
    });

    const { container, root } = renderWorkspace();

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("New Person");

    const applyButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Apply Visible Decisions")
    );
    await act(async () => {
      applyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(apiMocks.importImmichPeople).toHaveBeenCalledWith(
      [{ action: "create", providerPersonId: "immich-1", givenName: "New", surname: "Person" }],
      { importThumbnails: true }
    );

    act(() => {
      root.unmount();
    });
  });
});
