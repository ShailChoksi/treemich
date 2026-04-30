import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpConflictError } from "./errors.js";

const relationshipFindFirstMock = vi.fn();
const lifeEventFindFirstMock = vi.fn();
const lifeEventCreateMock = vi.fn();
const lifeEventFindFirstOrThrowMock = vi.fn();

const transactionMock = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    lifeEvent: {
      create: lifeEventCreateMock,
      findFirstOrThrow: lifeEventFindFirstOrThrowMock
    },
    citation: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({})
    },
    repository: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "repo-1" })
    },
    source: {
      create: vi.fn().mockResolvedValue({ id: "src-1" })
    }
  };
  return fn(tx);
});

vi.mock("../db/client.js", () => ({
  prisma: {
    $transaction: transactionMock,
    relationship: { findFirst: relationshipFindFirstMock },
    lifeEvent: {
      findFirst: lifeEventFindFirstMock,
      create: lifeEventCreateMock
    },
    place: { findFirst: vi.fn() }
  }
}));

const mockResolver = { resolveProfile: vi.fn().mockResolvedValue({ id: "pp-1" }) };

describe("LifeEventService.createRelationshipLifeEvent duplicate guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    relationshipFindFirstMock.mockResolvedValue({ id: "rel-1", userId: "user-1" });
    lifeEventCreateMock.mockResolvedValue({ id: "new-event" });
    lifeEventFindFirstOrThrowMock.mockResolvedValue({
      id: "new-event",
      userId: "user-1",
      eventType: "MARRIAGE",
      dateQualifier: "EXACT",
      year: 2000,
      month: 1,
      day: 1,
      endYear: null,
      endMonth: null,
      endDay: null,
      personProfileId: null,
      relationshipId: "rel-1",
      placeId: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      place: null,
      citations: []
    });
  });

  it("throws HttpConflictError when a MARRIAGE already exists for the relationship", async () => {
    lifeEventFindFirstMock.mockResolvedValueOnce({ id: "existing-m" });

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService(mockResolver);

    await expect(
      service.createRelationshipLifeEvent("user-1", "rel-1", {
        eventType: "MARRIAGE",
        year: 2000,
        month: 1,
        day: 1
      })
    ).rejects.toBeInstanceOf(HttpConflictError);

    expect(lifeEventFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          relationshipId: "rel-1",
          eventType: "MARRIAGE"
        })
      })
    );
    expect(lifeEventCreateMock).toHaveBeenCalledTimes(0);
  });

  it("allows MARRIAGE when none exists yet", async () => {
    lifeEventFindFirstMock.mockResolvedValueOnce(null);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService(mockResolver);

    await service.createRelationshipLifeEvent("user-1", "rel-1", {
      eventType: "MARRIAGE",
      year: 2000,
      month: 1,
      day: 1
    });

    expect(lifeEventCreateMock).toHaveBeenCalledTimes(1);
  });
});
