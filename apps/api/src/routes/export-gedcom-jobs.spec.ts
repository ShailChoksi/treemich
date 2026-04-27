import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scheduleGedcomExportJobMock = vi.fn();

vi.mock("../gedcom/exportJobRunner.js", () => ({
  scheduleGedcomExportJob: scheduleGedcomExportJobMock
}));

const gedcomExportJobCreateMock = vi.fn();
const gedcomExportJobFindFirstMock = vi.fn();

vi.mock("../db/client.js", () => ({
  prisma: {
    gedcomExportJob: {
      create: gedcomExportJobCreateMock,
      findFirst: gedcomExportJobFindFirstMock
    }
  }
}));

vi.mock("../auth/request.js", () => ({
  getRequiredAuth: () => ({
    user: { id: "user-1" }
  })
}));

describe("export GEDCOM job routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { registerExportGedcomJobRoutes } = await import("./export-gedcom-jobs.js");
    app = Fastify();
    await app.register(registerExportGedcomJobRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /export/gedcom/jobs creates a row and schedules the worker", async () => {
    const createdAt = new Date();
    gedcomExportJobCreateMock.mockResolvedValue({
      id: "job-1",
      status: "PENDING",
      createdAt
    });

    const res = await app.inject({
      method: "POST",
      url: "/export/gedcom/jobs",
      payload: { redactLiving: true }
    });

    expect(res.statusCode).toBe(200);
    expect(scheduleGedcomExportJobMock).toHaveBeenCalledWith("job-1", expect.anything());
    const body = JSON.parse(res.body) as { id: string; status: string };
    expect(body.id).toBe("job-1");
    expect(body.status).toBe("PENDING");
    expect(gedcomExportJobCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          redactLiving: true,
          includeTreemichCustomTags: true
        })
      })
    );
  });

  it("GET /export/gedcom/jobs/:jobId returns metadata", async () => {
    gedcomExportJobFindFirstMock.mockResolvedValue({
      id: "job-1",
      status: "COMPLETED",
      redactLiving: false,
      includeTreemichCustomTags: true,
      byteSize: 120,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:01.000Z"),
      startedAt: new Date("2026-01-01T00:00:00.100Z"),
      completedAt: new Date("2026-01-01T00:00:00.200Z"),
      errorMessage: null
    });

    const res = await app.inject({ method: "GET", url: "/export/gedcom/jobs/job-1" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { resultPath: string | null; status: string };
    expect(body.status).toBe("COMPLETED");
    expect(body.resultPath).toBe("/export/gedcom/jobs/job-1/ged");
  });

  it("GET /export/gedcom/jobs/:jobId/ged returns attachment when complete", async () => {
    gedcomExportJobFindFirstMock.mockResolvedValueOnce({
      status: "COMPLETED",
      gedcomUtf8: "0 HEAD\n0 TRLR\n"
    });

    const res = await app.inject({ method: "GET", url: "/export/gedcom/jobs/job-1/ged" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.body).toContain("HEAD");
  });
});
