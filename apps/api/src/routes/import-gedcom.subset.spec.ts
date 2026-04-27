import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const gedcomImportJobCreateMock = vi.fn();
const getRequiredAuthMock = vi.fn(() => ({ user: { id: "user-1" } }));
const buildGedcomImportPreviewMock = vi.fn((gedcomUtf8: string) => {
  void gedcomUtf8;
  return {
    indis: [],
    fams: [],
    records: [],
    lineLog: []
  };
});
const mergeIndiMatchesMock = vi.fn((matches: Record<string, string>, records: unknown[]) => {
  void matches;
  void records;
  return new Map<string, string>();
});
const validateFamMatchesMock = vi.fn((preview: unknown, merged: unknown) => {
  void preview;
  void merged;
  return "FAM @F1@: missing CHIL @I2@";
});
const scheduleGedcomImportJobMock = vi.fn();

vi.mock("../config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/env.js")>();
  return {
    ...actual,
    isGedcomImportEnabled: () => true,
    maxGedcomImportBytes: () => 3_000_000,
    maxGedcomImportLineLogEntries: () => 2000
  };
});

vi.mock("../auth/request.js", () => ({
  getRequiredAuth: () => getRequiredAuthMock()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    gedcomImportJob: {
      create: gedcomImportJobCreateMock
    }
  }
}));

vi.mock("../gedcom/importRunner.js", () => ({
  buildGedcomImportPreview: (gedcomUtf8: string) => buildGedcomImportPreviewMock(gedcomUtf8),
  mergeIndiMatches: (matches: Record<string, string>, records: unknown[]) =>
    mergeIndiMatchesMock(matches, records),
  validateFamMatches: (preview: unknown, merged: unknown) => validateFamMatchesMock(preview, merged),
  scheduleGedcomImportJob: (jobId: string, services: unknown, logger: unknown) =>
    scheduleGedcomImportJobMock(jobId, services, logger)
}));

describe("import GEDCOM subset matching", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 422 by default when family pointers are unmatched", async () => {
    const { registerImportGedcomRoutes } = await import("./import-gedcom.js");
    const app = Fastify();
    (app as unknown as { services: unknown }).services = {};
    await app.register(registerImportGedcomRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/import/gedcom/jobs",
      payload: {
        gedcomUtf8: "0 HEAD\n0 TRLR\n",
        indiMatches: {}
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
    const { registerImportGedcomRoutes } = await import("./import-gedcom.js");
    const app = Fastify();
    (app as unknown as { services: unknown }).services = {};
    await app.register(registerImportGedcomRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/import/gedcom/jobs",
      payload: {
        gedcomUtf8: "0 HEAD\n0 TRLR\n",
        indiMatches: {},
        importOptions: { allowPartialMatches: true }
      }
    });
    expect(res.statusCode).toBe(200);
    expect(gedcomImportJobCreateMock).toHaveBeenCalledTimes(1);
    expect(scheduleGedcomImportJobMock).toHaveBeenCalledWith("job-1", expect.anything(), expect.anything());
    await app.close();
  });
});
