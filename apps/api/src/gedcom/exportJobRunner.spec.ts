import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  loadGedcomExportInput: vi.fn(),
  buildGedcomDocument: vi.fn()
}));

vi.mock("../config/env.js", () => ({
  env: {
    TREEMICH_GEDCOM_JOB_STALE_AFTER_MS: 60_000
  },
  maxGedcomImportBytes: () => 10_000
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    gedcomExportJob: {
      updateMany: mocks.updateMany,
      findUnique: mocks.findUnique,
      update: mocks.update
    }
  }
}));

vi.mock("./loadExportInput.js", () => ({
  loadGedcomExportInput: mocks.loadGedcomExportInput
}));

vi.mock("./writer.js", () => ({
  buildGedcomDocument: mocks.buildGedcomDocument
}));

describe("processGedcomExportJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("atomically claims a pending job before exporting", async () => {
    const { processGedcomExportJob } = await import("./exportJobRunner.js");
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.findUnique.mockResolvedValue({
      id: "job-1",
      userId: "user-1",
      redactLiving: true,
      includeTreemichCustomTags: false
    });
    mocks.loadGedcomExportInput.mockResolvedValue({ personProfiles: [] });
    mocks.buildGedcomDocument.mockReturnValue({ gedcomUtf8: "0 HEAD\n0 TRLR\n" });

    await processGedcomExportJob("job-1");

    expect(mocks.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "job-1",
          OR: expect.arrayContaining([expect.objectContaining({ status: "PENDING" })])
        }),
        data: expect.objectContaining({
          status: "RUNNING",
          errorMessage: null
        })
      })
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          byteSize: expect.any(Number)
        })
      })
    );
  });

  it("does not export when another worker already claimed the job", async () => {
    const { processGedcomExportJob } = await import("./exportJobRunner.js");
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    await processGedcomExportJob("job-1");

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.loadGedcomExportInput).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
