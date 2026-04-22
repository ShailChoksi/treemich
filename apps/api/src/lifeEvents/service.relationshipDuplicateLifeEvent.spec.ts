import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpConflictError } from "./errors.js";

const relationshipFindFirstMock = vi.fn();
const lifeEventFindFirstMock = vi.fn();
const lifeEventCreateMock = vi.fn();

vi.mock("../db/client.js", () => ({
  prisma: {
    relationship: { findFirst: relationshipFindFirstMock },
    lifeEvent: {
      findFirst: lifeEventFindFirstMock,
      create: lifeEventCreateMock
    },
    place: { findFirst: vi.fn() }
  }
}));

describe("LifeEventService.createRelationshipLifeEvent duplicate guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    relationshipFindFirstMock.mockResolvedValue({ id: "rel-1", userId: "user-1" });
    lifeEventCreateMock.mockResolvedValue({});
  });

  it("throws HttpConflictError when a MARRIAGE already exists for the relationship", async () => {
    lifeEventFindFirstMock.mockResolvedValueOnce({ id: "existing-m" });

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService();

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
    const service = new LifeEventService();

    await service.createRelationshipLifeEvent("user-1", "rel-1", {
      eventType: "MARRIAGE",
      year: 2000,
      month: 1,
      day: 1
    });

    expect(lifeEventCreateMock).toHaveBeenCalledTimes(1);
  });
});
