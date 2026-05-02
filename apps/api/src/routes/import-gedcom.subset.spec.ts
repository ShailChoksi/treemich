import AdmZip from "adm-zip";
import Fastify from "fastify";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const gedcomImportJobCreateMock = vi.fn();
const gedcomImportJobUpdateMock = vi.fn();
const getRequiredAuthMock = vi.fn(() => ({ user: { id: "user-1" } }));
const validateFamMatchesMock = vi.fn((_preview: unknown, _indiMap: unknown): string | null =>
  "FAM @F1@: missing CHIL @I2@"
);
const scheduleGedcomImportJobMock = vi.fn();
const stageGedcomArchiveMediaFilesMock = vi.fn();

const gedcomImportPreviewSessionFindFirst = vi.fn();
const gedcomImportPreviewSessionDelete = vi.fn();
const gedcomImportPreviewSessionDeleteMany = vi.fn();
const gedcomImportPreviewSessionFindMany = vi.fn();
const gedcomImportPreviewSessionCreate = vi.fn();

vi.mock("../config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/env.js")>();
  return {
    ...actual,
    isGedcomImportEnabled: () => true,
    maxGedcomImportBytes: () => 3_000_000,
    maxGedcomImportLineLogEntries: () => 2000,
    maxGedcomMediaArchiveBytes: () => 100_000_000
  };
});

vi.mock("../auth/request.js", () => ({
  getRequiredAuth: () => getRequiredAuthMock()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    gedcomImportJob: {
      create: gedcomImportJobCreateMock,
      update: gedcomImportJobUpdateMock
    },
    gedcomImportPreviewSession: {
      create: gedcomImportPreviewSessionCreate,
      findFirst: gedcomImportPreviewSessionFindFirst,
      delete: gedcomImportPreviewSessionDelete,
      deleteMany: gedcomImportPreviewSessionDeleteMany,
      findMany: gedcomImportPreviewSessionFindMany
    }
  }
}));

vi.mock("../gedcom/archiveImport.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../gedcom/archiveImport.js")>();
  return {
    ...actual,
    stageGedcomArchiveMediaFiles: (jobId: string, files: unknown[]) =>
      stageGedcomArchiveMediaFilesMock(jobId, files)
  };
});

vi.mock("../gedcom/importRunner.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../gedcom/importRunner.js")>();
  return {
    ...actual,
    validateFamMatches: (preview: unknown, merged: unknown) => validateFamMatchesMock(preview, merged),
    scheduleGedcomImportJob: (jobId: string, services: unknown, logger: unknown) =>
      scheduleGedcomImportJobMock(jobId, services, logger)
  };
});

const previewSessionRow = () => ({
  id: "pv-1",
  userId: "user-1",
  expiresAt: new Date(Date.now() + 3_600_000),
  fileName: "tree.ged",
  isArchive: false,
  gedcomUtf8: "0 HEAD\n0 TRLR\n",
  stagedArchivePath: null,
  lineLog: [],
  indiRows: [],
  fams: [],
  media: [],
  archiveMediaFiles: null,
  famMatchError: null
});

describe("import GEDCOM subset matching", () => {
  afterEach(() => {
    vi.clearAllMocks();
    validateFamMatchesMock.mockReturnValue("FAM @F1@: missing CHIL @I2@");
    gedcomImportPreviewSessionFindMany.mockResolvedValue([]);
    gedcomImportPreviewSessionDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("returns 422 by default when family pointers are unmatched", async () => {
    gedcomImportPreviewSessionFindFirst.mockResolvedValue(previewSessionRow());
    const { registerImportGedcomRoutes } = await import("./import-gedcom.js");
    const app = Fastify();
    (app as unknown as { services: unknown }).services = {};
    await app.register(registerImportGedcomRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/import/gedcom/jobs/from-preview",
      payload: {
        previewId: "pv-1",
        indiMatches: {},
        importOptions: { unmatchedIndiPolicy: "MATCH_ONLY" }
      }
    });
    expect(res.statusCode).toBe(422);
    expect(gedcomImportJobCreateMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows job creation when allowPartialMatches=true", async () => {
    gedcomImportJobCreateMock.mockResolvedValue({
      id: "job-1",
      status: "PENDING",
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    });
    gedcomImportPreviewSessionFindFirst.mockResolvedValue(previewSessionRow());
    validateFamMatchesMock.mockReturnValueOnce(null);
    const { registerImportGedcomRoutes } = await import("./import-gedcom.js");
    const app = Fastify();
    (app as unknown as { services: unknown }).services = {};
    await app.register(registerImportGedcomRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/import/gedcom/jobs/from-preview",
      payload: {
        previewId: "pv-1",
        indiMatches: {},
        importOptions: { allowPartialMatches: true }
      }
    });
    expect(res.statusCode).toBe(200);
    expect(gedcomImportJobCreateMock).toHaveBeenCalledTimes(1);
    expect(scheduleGedcomImportJobMock).toHaveBeenCalledWith("job-1", expect.anything(), expect.anything());
    expect(gedcomImportPreviewSessionDelete).toHaveBeenCalledWith({ where: { id: "pv-1" } });
    await app.close();
  });

  it("bypasses FAM validation and creates a job when unmatchedIndiPolicy is CREATE", async () => {
    gedcomImportJobCreateMock.mockResolvedValue({
      id: "job-create",
      status: "PENDING",
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    });
    gedcomImportPreviewSessionFindFirst.mockResolvedValue(previewSessionRow());
    const { registerImportGedcomRoutes } = await import("./import-gedcom.js");
    const app = Fastify();
    (app as unknown as { services: unknown }).services = {};
    await app.register(registerImportGedcomRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/import/gedcom/jobs/from-preview",
      payload: {
        previewId: "pv-1",
        indiMatches: {},
        importOptions: { unmatchedIndiPolicy: "CREATE" }
      }
    });
    expect(res.statusCode).toBe(200);
    expect(gedcomImportJobCreateMock).toHaveBeenCalledTimes(1);
    expect(gedcomImportJobCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          importOptions: expect.objectContaining({ unmatchedIndiPolicy: "CREATE" })
        })
      })
    );
    await app.close();
  });

  it("still returns 422 for FAM mismatch when policy is MATCH_ONLY", async () => {
    gedcomImportPreviewSessionFindFirst.mockResolvedValue(previewSessionRow());
    const { registerImportGedcomRoutes } = await import("./import-gedcom.js");
    const app = Fastify();
    (app as unknown as { services: unknown }).services = {};
    await app.register(registerImportGedcomRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/import/gedcom/jobs/from-preview",
      payload: {
        previewId: "pv-1",
        indiMatches: {},
        importOptions: { unmatchedIndiPolicy: "MATCH_ONLY" }
      }
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toMatch(/CREATE.*automatically|allowPartialMatches/i);
    await app.close();
  });

  it("creates archive import jobs from-preview with staged ZIP", async () => {
    gedcomImportJobCreateMock.mockResolvedValue({
      id: "job-archive",
      status: "PENDING",
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    });
    gedcomImportJobUpdateMock.mockResolvedValue({});
    const zip = new AdmZip();
    zip.addFile("tree.ged", Buffer.from("0 HEAD\n0 TRLR\n", "utf8"));
    const zipDir = await mkdtemp(join(tmpdir(), "gedcom-subset-"));
    const zipPath = join(zipDir, "upload.zip");
    await writeFile(zipPath, zip.toBuffer());
    gedcomImportPreviewSessionFindFirst.mockResolvedValue({
      ...previewSessionRow(),
      isArchive: true,
      stagedArchivePath: zipPath,
      gedcomUtf8: "0 HEAD\n0 TRLR\n"
    });
    stageGedcomArchiveMediaFilesMock.mockResolvedValue({
      archiveDir: "/tmp/job-archive",
      files: [{ normalizedPath: "media/a.jpg", stagedPath: "/tmp/job-archive/a.jpg" }]
    });
    validateFamMatchesMock.mockReturnValueOnce(null);

    const { registerImportGedcomRoutes } = await import("./import-gedcom.js");
    const app = Fastify();
    (app as unknown as { services: unknown }).services = {};
    await app.register(registerImportGedcomRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/import/gedcom/jobs/from-preview",
      payload: {
        previewId: "pv-1",
        indiMatches: {},
        importOptions: { allowPartialMatches: true }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(gedcomImportJobUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-archive" },
        data: expect.objectContaining({
          importOptions: expect.objectContaining({
            mediaArchive: expect.objectContaining({ archiveDir: "/tmp/job-archive" })
          })
        })
      })
    );
    await app.close();
  });
});
