import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "../lib/api";
import { GedcomInterchangeSection } from "./GedcomInterchangeSection";

const apiMocks = vi.hoisted(() => ({
  createGedcomImportPreview: vi.fn(),
  deleteGedcomImportPreviewSession: vi.fn(),
  getGedcomPreviewIndisPage: vi.fn(),
  postGedcomImportJobFromPreview: vi.fn(),
  getGedcomImportJob: vi.fn(),
  fetchGedcomExportDownload: vi.fn(),
  postGedcomExportJob: vi.fn(),
  getGedcomExportJob: vi.fn(),
  downloadGedcomExportJobResult: vi.fn(),
  searchPeople: vi.fn()
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    createGedcomImportPreview: apiMocks.createGedcomImportPreview,
    deleteGedcomImportPreviewSession: apiMocks.deleteGedcomImportPreviewSession,
    getGedcomPreviewIndisPage: apiMocks.getGedcomPreviewIndisPage,
    postGedcomImportJobFromPreview: apiMocks.postGedcomImportJobFromPreview,
    getGedcomImportJob: apiMocks.getGedcomImportJob,
    fetchGedcomExportDownload: apiMocks.fetchGedcomExportDownload,
    postGedcomExportJob: apiMocks.postGedcomExportJob,
    getGedcomExportJob: apiMocks.getGedcomExportJob,
    downloadGedcomExportJobResult: apiMocks.downloadGedcomExportJobResult,
    searchPeople: apiMocks.searchPeople
  };
});

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const sampleRow = (xref: string, displayName: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  xref,
  displayName,
  personHint: null as string | null,
  fullName: displayName,
  alternateNames: [] as string[],
  birthDate: "15 Jan 1990",
  relatedPeople: [{ label: "Spouse" as const, name: "Jamie" }],
  ...overrides
});

const defaultCreateResponse = (rowOverrides?: Partial<Record<string, unknown>>) => ({
  previewId: "pv-1",
  expiresAt: "2026-12-31T00:00:00.000Z",
  initialMatchedXrefs: [] as string[],
  summary: {
    totalIndis: 1,
    totalFams: 0,
    totalMedia: 0,
    matchedByHintCount: 0,
    archiveMediaFileCount: 0,
    famMatchError: null as string | null
  },
  lineLog: [
    {
      severity: "warn",
      lineNo: 0,
      message: "GEDCOM import diagnostics truncated; 12 additional entries were omitted."
    }
  ],
  archiveMediaFiles: [] as { path: string; byteSize: number; mimeType: string | null }[],
  page: {
    offset: 0,
    limit: 50,
    total: 1,
    rows: [sampleRow("@I1@", "Pat Fixture", rowOverrides)]
  }
});

describe("GedcomInterchangeSection", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );
    apiMocks.createGedcomImportPreview.mockImplementation(async () => defaultCreateResponse());
    apiMocks.deleteGedcomImportPreviewSession.mockResolvedValue(undefined);
    apiMocks.getGedcomPreviewIndisPage.mockImplementation(async (previewId, params) => ({
      previewId,
      offset: params.offset ?? 0,
      limit: params.limit ?? 50,
      total: 1,
      rows: [sampleRow("@I1@", "Pat Fixture")],
      summary: {
        totalIndis: 1,
        totalFams: 0,
        totalMedia: 0,
        famMatchError: null
      }
    }));
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const mount = async (people: Person[] = []) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<GedcomInterchangeSection people={people} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    apiMocks.createGedcomImportPreview.mockClear();
    apiMocks.deleteGedcomImportPreviewSession.mockClear();
    apiMocks.getGedcomPreviewIndisPage.mockClear();
    return { root, container };
  };

  const setInputValue = (el: HTMLInputElement, value: string) => {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
    desc?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const chooseGedFile = async (container: HTMLElement, name = "tree.ged") => {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const ged = new File(["0 HEAD\n0 TRLR\n"], name, { type: "text/plain" });
    await act(async () => {
      Object.defineProperty(input, "files", { value: [ged], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    return ged;
  };

  it("auto-previews after file selection and shows parser log", async () => {
    const { root, container } = await mount();
    await chooseGedFile(container);

    expect(apiMocks.createGedcomImportPreview).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Parser log (1 entries, first 40 shown)");
    expect(container.textContent).toContain("GEDCOM import diagnostics truncated");
    expect(container.textContent).not.toContain("Ref:");
    expect(container.textContent).toContain("Born 15 Jan 1990");
    expect(container.textContent).toContain("Spouse: Jamie");
    expect([...container.querySelectorAll("button")].some((b) => b.textContent === "Preview")).toBe(false);
    root.unmount();
    container.remove();
  });

  it("submits dry-runs via from-preview job without create confirmation", async () => {
    const confirmSpy = vi.mocked(globalThis.confirm);
    apiMocks.getGedcomPreviewIndisPage.mockImplementation(async (previewId, params) => ({
      previewId,
      offset: params.offset ?? 0,
      limit: params.limit ?? 50,
      total: 1,
      rows: [
        {
          xref: "@I1@",
          displayName: "Pat Fixture",
          personHint: "person-1",
          fullName: "Pat Fixture",
          alternateNames: [],
          birthDate: null,
          relatedPeople: []
        }
      ],
      summary: {
        totalIndis: 1,
        totalFams: 0,
        totalMedia: 0,
        famMatchError: null
      }
    }));
    apiMocks.postGedcomImportJobFromPreview.mockResolvedValue({
      id: "job-1",
      status: "PENDING",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    apiMocks.getGedcomImportJob.mockResolvedValue({
      id: "job-1",
      status: "COMPLETED",
      fileName: "tree.ged",
      byteSize: 10,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      startedAt: "2026-01-01T00:00:00.100Z",
      completedAt: "2026-01-01T00:00:00.200Z",
      errorMessage: null,
      summary: {
        dryRunDiff: {
          creates: { personLifeEvents: 1 },
          updates: { profiles: 1 },
          reuses: {},
          skips: {},
          conflicts: {},
          warnings: 0
        }
      },
      lineLog: []
    });
    const { root, container } = await mount([{ id: "person-1", name: "Pat Fixture" } as never]);

    await chooseGedFile(container);

    const dryRunToggle = [...container.querySelectorAll('input[type="checkbox"]')][0] as HTMLInputElement;
    await act(async () => {
      dryRunToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const submitButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Run dry-run"
    );
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(apiMocks.postGedcomImportJobFromPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        previewId: "pv-1",
        importOptions: expect.objectContaining({ dryRun: true, unmatchedIndiPolicy: "CREATE" })
      })
    );
    expect(container.textContent).toContain("Dry-run complete");
    expect(container.textContent).toContain("personLifeEvents: 1");
    root.unmount();
    container.remove();
  });

  it("surfaces failed import job messages", async () => {
    vi.mocked(globalThis.confirm).mockReturnValue(true);
    apiMocks.postGedcomImportJobFromPreview.mockResolvedValue({
      id: "job-failed",
      status: "PENDING",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    apiMocks.getGedcomImportJob.mockResolvedValue({
      id: "job-failed",
      status: "FAILED",
      fileName: "tree.ged",
      byteSize: 10,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      startedAt: "2026-01-01T00:00:00.100Z",
      completedAt: "2026-01-01T00:00:00.200Z",
      errorMessage: "source write failed; partial records may already exist",
      summary: null,
      lineLog: [{ severity: "error", lineNo: 0, message: "source write failed" }]
    });
    const { root, container } = await mount();
    await chooseGedFile(container);
    const submitButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Apply import"
    );
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("source write failed");
    root.unmount();
    container.remove();
  });

  it("shows Retry preview after preview failure and retries", async () => {
    const { root, container } = await mount();
    apiMocks.createGedcomImportPreview.mockRejectedValueOnce(new Error("network down"));
    await chooseGedFile(container);
    expect(container.textContent).toContain("network down");
    const retry = [...container.querySelectorAll("button")].find((b) => b.textContent === "Retry preview");
    expect(retry).toBeTruthy();
    await act(async () => {
      retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Pat Fixture");
    root.unmount();
    container.remove();
  });

  it("requests the next page at offset 50 when Next 50 is used", async () => {
    apiMocks.createGedcomImportPreview.mockResolvedValue({
      ...defaultCreateResponse(),
      page: {
        offset: 0,
        limit: 50,
        total: 60,
        rows: Array.from({ length: 50 }, (_, i) => sampleRow(`@I${i}@`, `Person ${i}`))
      },
      summary: { ...defaultCreateResponse().summary, totalIndis: 60 }
    });
    apiMocks.getGedcomPreviewIndisPage.mockImplementation(async (previewId, params) => {
      const offset = params.offset ?? 0;
      return {
        previewId,
        offset,
        limit: 50,
        total: 60,
        rows:
          offset === 0
            ? Array.from({ length: 50 }, (_, i) => sampleRow(`@I${i}@`, `Person ${i}`))
            : Array.from({ length: 10 }, (_, i) => sampleRow(`@I${50 + i}@`, `Person ${50 + i}`)),
        summary: {
          totalIndis: 60,
          totalFams: 0,
          totalMedia: 0,
          famMatchError: null
        }
      };
    });
    const { root, container } = await mount();
    await chooseGedFile(container);
    apiMocks.getGedcomPreviewIndisPage.mockClear();
    const next = [...container.querySelectorAll("button")].find((b) => b.textContent === "Next 50");
    await act(async () => {
      next!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiMocks.getGedcomPreviewIndisPage).toHaveBeenCalledWith(
      "pv-1",
      expect.objectContaining({ offset: 50, limit: 50 })
    );
    root.unmount();
    container.remove();
  });

  it("debounces GEDCOM row search and passes q to the preview page API", async () => {
    const { root, container } = await mount();
    await chooseGedFile(container);
    apiMocks.getGedcomPreviewIndisPage.mockClear();
    const searchInput = container.querySelector(".gedcom-source-search-input") as HTMLInputElement;
    await act(async () => {
      setInputValue(searchInput, "Pat");
    });
    let sawQuery = false;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      await act(async () => {
        await Promise.resolve();
      });
      if (apiMocks.getGedcomPreviewIndisPage.mock.calls.some(([, p]) => p?.q === "Pat")) {
        sawQuery = true;
        break;
      }
    }
    expect(sawQuery).toBe(true);
    root.unmount();
    container.remove();
  });

  it("confirms before real import when create-missing would apply to unmatched rows", async () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);
    apiMocks.createGedcomImportPreview.mockResolvedValue(
      defaultCreateResponse({ personHint: null, fullName: "Unmatched One" })
    );
    const { root, container } = await mount();
    await chooseGedFile(container);
    const submitButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Apply import"
    );
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("This import will create up to 1 new Treemich people")
    );
    expect(apiMocks.postGedcomImportJobFromPreview).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });

  it("uses server search in the match combobox and submits selected person", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    );
    apiMocks.searchPeople.mockResolvedValue({
      people: [
        {
          id: "p-search",
          name: "Alex Searchhit",
          birthDate: "2000",
          thumbnail: null,
          profile: { givenName: "Alex", surname: "Searchhit" },
          hasRelationship: true
        } as never
      ],
      nextOffset: null
    });
    apiMocks.postGedcomImportJobFromPreview.mockResolvedValue({
      id: "job-2",
      status: "PENDING",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    apiMocks.getGedcomImportJob.mockResolvedValue({
      id: "job-2",
      status: "COMPLETED",
      fileName: "tree.ged",
      byteSize: 10,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      startedAt: null,
      completedAt: "2026-01-01T00:00:01.000Z",
      errorMessage: null,
      summary: {},
      lineLog: []
    });

    const alexPerson = {
      id: "p-search",
      name: "Alex Searchhit",
      birthDate: "2000",
      thumbnail: null,
      profile: { givenName: "Alex", surname: "Searchhit" },
      hasRelationship: true
    } as Person;
    const { root, container } = await mount([alexPerson]);
    await chooseGedFile(container);

    const comboInput = container.querySelector(
      'input.gedcom-match-combobox-input[role="combobox"]'
    ) as HTMLInputElement;
    await act(async () => {
      comboInput.focus();
      setInputValue(comboInput, "Al");
    });
    let sawSearch = false;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      await act(async () => {
        await Promise.resolve();
      });
      if (
        apiMocks.searchPeople.mock.calls.some(
          (c) => c[0]?.query === "Al" && c[0]?.limit === 10 && c[0]?.offset === 0
        )
      ) {
        sawSearch = true;
        break;
      }
    }
    expect(sawSearch).toBe(true);

    const option = [...container.querySelectorAll('[role="option"]')].find((el) =>
      el.textContent?.includes("Alex Searchhit")
    ) as HTMLButtonElement;
    await act(async () => {
      option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Alex Searchhit");
    expect(container.querySelector(".gedcom-match-selected .gedcom-match-avatar-initials")?.textContent).toBe(
      "AS"
    );

    const submitButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Apply import"
    );
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(apiMocks.postGedcomImportJobFromPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        indiMatches: expect.objectContaining({ "@I1@": "p-search" })
      })
    );
    root.unmount();
    container.remove();
  });
});
