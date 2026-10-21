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
    expect(container.textContent).toContain("No new people");

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
      if (container.textContent?.includes("3 new people added")) {
        break;
      }
    }
    expect(container.textContent).toContain("3 new people added");
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

  it("filters birthday results, shows dates, and keeps an already-linked row on its preview result", async () => {
    apiMocks.getImmichImportPreview.mockResolvedValue({
      linked: true,
      people: [
        {
          providerPersonId: "immich-new",
          name: "New Person",
          birthDate: "1815-12-10",
          birthdayResult: "filled",
          birthYear: null,
          birthMonth: null,
          birthDay: null,
          thumbnailPath: null,
          linkedPersonId: null,
          linkedPersonName: null,
          candidates: []
        },
        {
          providerPersonId: "immich-linked",
          name: "Linked Person",
          birthDate: "1900-01-02",
          personResult: "alreadyLinked",
          birthdayResult: "equal",
          birthYear: 1900,
          birthMonth: 1,
          birthDay: 2,
          thumbnailPath: null,
          linkedPersonId: "p1",
          linkedPersonName: "Existing Person",
          candidates: []
        },
        {
          providerPersonId: "immich-bad",
          name: "Bad Date",
          birthDate: null,
          birthdayResult: "malformed",
          rawBirthDate: "not-a-date",
          birthYear: null,
          birthMonth: null,
          birthDay: null,
          thumbnailPath: null,
          linkedPersonId: null,
          linkedPersonName: null,
          candidates: []
        }
      ],
      totals: { immichPeople: 3, linkedPeople: 1, unlinkedPeople: 2 }
    });
    apiMocks.importImmichPeople.mockResolvedValue({
      results: [
        {
          providerPersonId: "immich-bad",
          action: "skip",
          status: "skipped",
          personResult: "skipped",
          birthDate: null,
          birthYear: null,
          birthMonth: null,
          birthDay: null
        }
      ],
      summary: {
        created: 0,
        linked: 0,
        skipped: 1,
        alreadyLinked: 0,
        errors: 0,
        thumbnailsImported: 0,
        birthdays: { filled: 0, equal: 0, conflict: 0, malformed: 0, absent: 0 }
      }
    });

    const { container, root } = renderWorkspace();
    const loadPreviewButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Load Immich Preview")
    );
    await act(async () => {
      loadPreviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("New Person");
    expect(container.textContent).toContain("Bad Date");
    expect(container.textContent).not.toContain("Linked Person");
    expect(container.textContent).toContain("Immich birthday: 1815-12-10");
    expect(container.textContent).toContain("Immich birthday: invalid");
    expect(container.textContent).toContain("Raw Immich birthday: not-a-date");
    expect(container.textContent).toContain("Treemich birthday: none");

    const unchanged = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Unchanged")
    );
    await act(async () => {
      unchanged?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Linked Person");
    expect(container.textContent).toContain("Treemich birthday: 1900-01-02");
    expect(container.textContent).not.toContain("New Person");

    const all = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.startsWith("All")
    );
    await act(async () => {
      all?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const decision = container.querySelector(
      'select[aria-label="Decision for New Person"]'
    ) as HTMLSelectElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    await act(async () => {
      valueSetter?.call(decision, "skip");
      decision.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const skipped = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.startsWith("Skipped")
    );
    await act(async () => {
      skipped?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("New Person");
    expect(container.textContent).not.toContain("Bad Date");

    const applyButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Apply Visible Decisions")
    );
    await act(async () => {
      applyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
      if (container.textContent?.includes("No new people")) {
        break;
      }
    }
    expect(container.textContent).toContain(
      "No new people, 0 imported, 0 unchanged, 0 conflicts kept, 0 invalid, 0 with no Immich birthday, 1 skipped, 0 failed."
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
