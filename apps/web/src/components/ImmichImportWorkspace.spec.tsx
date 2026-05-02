import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImmichImportWorkspace } from "./ImmichImportWorkspace";

const apiMocks = vi.hoisted(() => ({
  IMMICH_PEOPLE_SYNCED_EVENT: "treemich:immich-people-synced",
  getImmichImportPreview: vi.fn(),
  importImmichPeople: vi.fn(),
  importImmichThumbnails: vi.fn(),
  importImmichCooccurrence: vi.fn(),
  syncImmichLabelledPeople: vi.fn(),
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

    const loadPreviewButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Load Immich Preview")
    );
    await act(async () => {
      loadPreviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

  it("re-syncs labelled people and reloads preview when a preview was already loaded", async () => {
    apiMocks.getImmichImportPreview.mockResolvedValue({
      linked: true,
      people: [],
      totals: { immichPeople: 0, linkedPeople: 0, unlinkedPeople: 0 }
    });
    apiMocks.syncImmichLabelledPeople.mockResolvedValue({
      created: 0,
      updated: 1,
      alreadyLinked: 2,
      skippedUnnamed: 0,
      duplicateRecompute: { status: "skipped" }
    });

    const onImported = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ImmichImportWorkspace people={[{ id: "p1", name: "Existing Person" }]} onImported={onImported} />
      );
    });

    const loadPreviewButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Load Immich Preview")
    );
    await act(async () => {
      loadPreviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiMocks.getImmichImportPreview).toHaveBeenCalledTimes(1);

    const resyncButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Re-sync labelled people")
    );
    await act(async () => {
      resyncButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (
        apiMocks.syncImmichLabelledPeople.mock.calls.length > 0 &&
        apiMocks.getImmichImportPreview.mock.calls.length >= 2
      ) {
        break;
      }
    }

    expect(apiMocks.syncImmichLabelledPeople).toHaveBeenCalledTimes(1);
    expect(apiMocks.getImmichImportPreview.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("No new Immich people added");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows new-people headline when re-sync creates people", async () => {
    apiMocks.syncImmichLabelledPeople.mockResolvedValue({
      created: 3,
      updated: 0,
      alreadyLinked: 0,
      skippedUnnamed: 0,
      duplicateRecompute: { status: "skipped" }
    });
    const { container, root } = renderWorkspace();
    const resyncButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Re-sync labelled people")
    );
    await act(async () => {
      resyncButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (container.textContent?.includes("new Immich people added")) {
        break;
      }
    }
    expect(container.textContent).toContain("3 new Immich people added");
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows an error when re-sync fails", async () => {
    apiMocks.syncImmichLabelledPeople.mockRejectedValue(new Error("network boom"));
    const { container, root } = renderWorkspace();
    const resyncButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Re-sync labelled people")
    );
    await act(async () => {
      resyncButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (container.querySelector(".error-text")) {
        break;
      }
    }
    expect(container.querySelector(".error-text")?.textContent).toContain("network boom");
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
