import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GedcomInterchangeSection } from "./GedcomInterchangeSection";

const apiMocks = vi.hoisted(() => ({
  postGedcomImportPreview: vi.fn(),
  postGedcomImportArchivePreview: vi.fn(),
  postGedcomImportArchiveJob: vi.fn(),
  postGedcomImportJob: vi.fn(),
  getGedcomImportJob: vi.fn(),
  fetchGedcomExportDownload: vi.fn(),
  postGedcomExportJob: vi.fn(),
  getGedcomExportJob: vi.fn(),
  downloadGedcomExportJobResult: vi.fn()
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    postGedcomImportPreview: apiMocks.postGedcomImportPreview,
    postGedcomImportArchivePreview: apiMocks.postGedcomImportArchivePreview,
    postGedcomImportArchiveJob: apiMocks.postGedcomImportArchiveJob,
    postGedcomImportJob: apiMocks.postGedcomImportJob,
    getGedcomImportJob: apiMocks.getGedcomImportJob,
    fetchGedcomExportDownload: apiMocks.fetchGedcomExportDownload,
    postGedcomExportJob: apiMocks.postGedcomExportJob,
    getGedcomExportJob: apiMocks.getGedcomExportJob,
    downloadGedcomExportJobResult: apiMocks.downloadGedcomExportJobResult
  };
});

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("GedcomInterchangeSection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("previews ZIP bundles through the archive endpoint", async () => {
    apiMocks.postGedcomImportPreview.mockResolvedValue({
      indis: [],
      fams: [],
      media: [],
      archiveMediaFiles: [],
      unmatchedIndis: [],
      famMatchError: null,
      lineLog: []
    });
    apiMocks.postGedcomImportArchivePreview.mockResolvedValue({
      indis: [],
      fams: [],
      media: [{ xref: "@O1@", file: "media/a.jpg", title: "A", form: "image/jpeg" }],
      archiveMediaFiles: [{ path: "media/a.jpg", byteSize: 3, mimeType: "image/jpeg" }],
      unmatchedIndis: [],
      famMatchError: null,
      lineLog: []
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<GedcomInterchangeSection people={[]} />);
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const archive = new File([new Uint8Array([1, 2, 3])], "tree.zip", { type: "application/zip" });
    await act(async () => {
      Object.defineProperty(input, "files", { value: [archive], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const previewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Preview"
    );
    await act(async () => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(apiMocks.postGedcomImportArchivePreview).toHaveBeenCalledWith(archive);
    expect(container.textContent).toContain("Media in GEDCOM: 1 OBJE records");
    root.unmount();
  });

  it("submits dry-runs with match-only policy and displays structured diff output", async () => {
    apiMocks.postGedcomImportPreview.mockResolvedValue({
      indis: [{ xref: "@I1@", displayName: "Pat Fixture", immichHint: "person-1" }],
      fams: [],
      media: [],
      archiveMediaFiles: [],
      unmatchedIndis: [],
      unmatchedIndiPolicy: "MATCH_ONLY",
      famMatchError: null,
      lineLog: []
    });
    apiMocks.postGedcomImportJob.mockResolvedValue({
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
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<GedcomInterchangeSection people={[{ id: "person-1", name: "Pat Fixture" } as never]} />);
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const ged = new File(["0 HEAD\n0 TRLR\n"], "tree.ged", { type: "text/plain" });
    await act(async () => {
      Object.defineProperty(input, "files", { value: [ged], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const dryRunToggle = [...container.querySelectorAll('input[type="checkbox"]')][0] as HTMLInputElement;
    await act(async () => {
      dryRunToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const previewButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Preview"
    );
    await act(async () => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const submitButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Run dry-run"
    );
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(apiMocks.postGedcomImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        importOptions: expect.objectContaining({ dryRun: true, unmatchedIndiPolicy: "MATCH_ONLY" })
      })
    );
    expect(container.textContent).toContain("Dry-run complete");
    expect(container.textContent).toContain("personLifeEvents: 1");
    root.unmount();
  });
});
