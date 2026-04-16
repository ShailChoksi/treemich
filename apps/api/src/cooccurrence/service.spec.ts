import { beforeEach, describe, expect, it, vi } from "vitest";
import { CooccurrenceConflictError, CooccurrenceService } from "./service.js";

const createMockPrisma = () => {
  const treemichUserFindUniqueOrThrow = vi.fn();
  const cooccurrenceScheduleFindUnique = vi.fn();
  const cooccurrenceScheduleFindMany = vi.fn();
  const cooccurrenceScheduleCreate = vi.fn();
  const cooccurrenceScheduleUpdate = vi.fn();
  const cooccurrenceJobFindFirst = vi.fn();
  const cooccurrenceJobCreate = vi.fn();
  const cooccurrenceJobUpdate = vi.fn();
  const cooccurrenceEdgeDeleteMany = vi.fn();
  const cooccurrenceEdgeCreateMany = vi.fn();
  const cooccurrenceEdgeFindMany = vi.fn();
  const cooccurrenceEdgeFindUnique = vi.fn();
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      cooccurrenceEdge: {
        deleteMany: cooccurrenceEdgeDeleteMany,
        createMany: cooccurrenceEdgeCreateMany
      },
      cooccurrenceJob: {
        update: cooccurrenceJobUpdate
      }
    })
  );

  return {
    prisma: {
      treemichUser: {
        findUniqueOrThrow: treemichUserFindUniqueOrThrow
      },
      cooccurrenceSchedule: {
        findUnique: cooccurrenceScheduleFindUnique,
        findMany: cooccurrenceScheduleFindMany,
        create: cooccurrenceScheduleCreate,
        update: cooccurrenceScheduleUpdate
      },
      cooccurrenceJob: {
        findFirst: cooccurrenceJobFindFirst,
        create: cooccurrenceJobCreate,
        update: cooccurrenceJobUpdate
      },
      cooccurrenceEdge: {
        deleteMany: cooccurrenceEdgeDeleteMany,
        createMany: cooccurrenceEdgeCreateMany,
        findMany: cooccurrenceEdgeFindMany,
        findUnique: cooccurrenceEdgeFindUnique
      },
      $transaction: transaction
    },
    mocks: {
      treemichUserFindUniqueOrThrow,
      cooccurrenceScheduleFindUnique,
      cooccurrenceScheduleFindMany,
      cooccurrenceScheduleCreate,
      cooccurrenceScheduleUpdate,
      cooccurrenceJobFindFirst,
      cooccurrenceJobCreate,
      cooccurrenceJobUpdate,
      cooccurrenceEdgeDeleteMany,
      cooccurrenceEdgeCreateMany,
      cooccurrenceEdgeFindMany,
      cooccurrenceEdgeFindUnique,
      transaction
    }
  };
};

describe("CooccurrenceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chunks persisted edge inserts across multiple createMany calls", async () => {
    const { prisma, mocks } = createMockPrisma();
    let backgroundTask: (() => Promise<void>) | undefined;
    const now = new Date("2026-01-01T00:00:00.000Z");
    const service = new CooccurrenceService({
      prismaClient: prisma as never,
      now: () => now,
      runBackgroundTask: (task) => {
        backgroundTask = task;
      }
    });

    mocks.cooccurrenceJobFindFirst.mockResolvedValue(null);
    mocks.cooccurrenceScheduleFindUnique.mockResolvedValue({
      id: "schedule-1",
      userId: "user-1",
      enabled: true,
      intervalDays: 7,
      nextRunAt: now,
      lastRunAt: null
    });
    mocks.cooccurrenceScheduleUpdate.mockResolvedValue({});
    mocks.cooccurrenceJobCreate.mockResolvedValue({
      id: "job-1",
      userId: "user-1",
      status: "PENDING"
    });

    const immichClient = {
      listAssetsWithPeople: vi.fn().mockResolvedValue(
        Array.from({ length: 1001 }, (_, index) => ({
          assetId: `asset-${index}`,
          personIds: [`person-${index}`, `person-${index + 1_500}`]
        }))
      )
    };

    const job = await service.triggerComputation("user-1", immichClient as never);
    expect(job.id).toBe("job-1");

    await backgroundTask?.();

    expect(mocks.cooccurrenceEdgeDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" }
    });
    expect(mocks.cooccurrenceEdgeCreateMany).toHaveBeenCalledTimes(2);
    expect(mocks.cooccurrenceEdgeCreateMany.mock.calls[0]?.[0]?.data).toHaveLength(1000);
    expect(mocks.cooccurrenceEdgeCreateMany.mock.calls[1]?.[0]?.data).toHaveLength(1);
    expect(mocks.cooccurrenceJobUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "RUNNING",
          progress: 0.1
        })
      })
    );
    expect(mocks.cooccurrenceJobUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          sourcePhotoCount: 1001,
          edgeCount: 1001,
          progress: 1
        })
      })
    );
  });

  it("rejects duplicate computations while a job is already active", async () => {
    const { prisma, mocks } = createMockPrisma();
    const service = new CooccurrenceService({ prismaClient: prisma as never });

    mocks.cooccurrenceJobFindFirst.mockResolvedValue({ id: "job-running" });

    await expect(
      service.triggerComputation("user-1", { listAssetsWithPeople: vi.fn() } as never)
    ).rejects.toBeInstanceOf(CooccurrenceConflictError);
  });

  it("normalizes pair lookups before querying storage", async () => {
    const { prisma, mocks } = createMockPrisma();
    const service = new CooccurrenceService({ prismaClient: prisma as never });

    mocks.cooccurrenceEdgeFindUnique.mockResolvedValue({
      id: "edge-1",
      personAId: "person-a",
      personBId: "person-b",
      sharedPhotos: 4,
      score: 0.8,
      personAPhotoCount: 5,
      personBPhotoCount: 6,
      computedAt: new Date("2026-01-01T00:00:00.000Z")
    });

    const edge = await service.getEdgeBetween("user-1", "person-b", "person-a");

    expect(mocks.cooccurrenceEdgeFindUnique).toHaveBeenCalledWith({
      where: {
        userId_personAId_personBId: {
          userId: "user-1",
          personAId: "person-a",
          personBId: "person-b"
        }
      }
    });
    expect(edge?.personAId).toBe("person-a");
    expect(edge?.personBId).toBe("person-b");
  });

  it("rebuilds the persisted graph into the legacy co-occurrence response shape", async () => {
    const { prisma, mocks } = createMockPrisma();
    const service = new CooccurrenceService({ prismaClient: prisma as never });

    mocks.cooccurrenceJobFindFirst.mockResolvedValue({
      id: "job-1",
      userId: "user-1",
      status: "COMPLETED",
      sourcePhotoCount: 12,
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    });
    mocks.cooccurrenceEdgeFindMany.mockResolvedValue([
      {
        id: "edge-1",
        userId: "user-1",
        personAId: "p1",
        personBId: "p2",
        sharedPhotos: 3,
        score: 0.75,
        personAPhotoCount: 4,
        personBPhotoCount: 5,
        computedAt: new Date("2026-01-01T00:00:00.000Z")
      },
      {
        id: "edge-2",
        userId: "user-1",
        personAId: "p2",
        personBId: "p3",
        sharedPhotos: 2,
        score: 0.667,
        personAPhotoCount: 5,
        personBPhotoCount: 3,
        computedAt: new Date("2026-01-01T00:00:00.000Z")
      }
    ]);

    const result = await service.getPersistedPhotoCooccurrence("user-1", {
      minSharedPhotos: 2,
      minScore: 0
    });

    expect(result?.sourcePhotoCount).toBe(12);
    expect(result?.edges).toHaveLength(2);
    expect(result?.clusters[0]).toEqual({
      id: "cluster-p1",
      personIds: ["p1", "p2", "p3"],
      size: 3
    });
    expect(result?.computedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("recalculates nextRunAt from lastRunAt when preferences change", async () => {
    const { prisma, mocks } = createMockPrisma();
    const service = new CooccurrenceService({
      prismaClient: prisma as never,
      now: () => new Date("2026-01-20T00:00:00.000Z")
    });

    mocks.treemichUserFindUniqueOrThrow.mockResolvedValue({
      preferences: {
        cooccurrence: {
          refreshEnabled: false,
          refreshIntervalDays: 14
        }
      }
    });
    mocks.cooccurrenceScheduleFindUnique.mockResolvedValue({
      id: "schedule-1",
      userId: "user-1",
      enabled: true,
      intervalDays: 7,
      nextRunAt: new Date("2026-01-10T00:00:00.000Z"),
      lastRunAt: new Date("2026-01-01T00:00:00.000Z")
    });
    mocks.cooccurrenceScheduleUpdate.mockResolvedValue({});

    await service.syncScheduleFromPreferences("user-1");

    expect(mocks.cooccurrenceScheduleUpdate).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        enabled: false,
        intervalDays: 14,
        nextRunAt: new Date("2026-01-15T00:00:00.000Z")
      }
    });
  });

  it("queries only enabled due schedules for the scheduler loop", async () => {
    const { prisma, mocks } = createMockPrisma();
    const now = new Date("2026-01-20T12:00:00.000Z");
    const service = new CooccurrenceService({ prismaClient: prisma as never });

    mocks.cooccurrenceScheduleFindMany.mockResolvedValue([]);

    await service.getDueSchedules(now, 10);

    expect(mocks.cooccurrenceScheduleFindMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        nextRunAt: {
          lte: now
        }
      },
      include: {
        user: {
          include: {
            linkedAccount: true
          }
        }
      },
      orderBy: {
        nextRunAt: "asc"
      },
      take: 10
    });
  });
});
