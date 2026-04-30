import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpNotFoundError } from "./errors.js";

const mockProfileResolver = {
  resolveProfile: vi.fn()
};

const lifeEventFindManyMock = vi.fn();

vi.mock("../db/client.js", () => ({
  prisma: {
    lifeEvent: { findMany: lifeEventFindManyMock }
  }
}));

describe("LifeEventService.validatePersonLifeEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty findings when the person has no Treemich profile", async () => {
    mockProfileResolver.resolveProfile.mockRejectedValueOnce(new HttpNotFoundError("Person not found"));

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService(mockProfileResolver);
    const result = await service.validatePersonLifeEvents("user-1", "p-missing");

    expect(result).toEqual({ findings: [] });
    expect(lifeEventFindManyMock).toHaveBeenCalledTimes(0);
  });

  it("maps listPersonLifeEvents rows through computePersonLifeEventFindings", async () => {
    mockProfileResolver.resolveProfile.mockResolvedValueOnce("pp-1");
    lifeEventFindManyMock.mockResolvedValueOnce([
      {
        id: "e-birth",
        eventType: "BIRTH",
        year: 2010,
        month: 1,
        day: 1,
        place: null,
        citations: []
      },
      {
        id: "e-death",
        eventType: "DEATH",
        year: 2000,
        month: 1,
        day: 1,
        place: null,
        citations: []
      }
    ]);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService(mockProfileResolver);
    const result = await service.validatePersonLifeEvents("user-1", "p1");

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.code).toBe("birth_after_death");
    expect(lifeEventFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", personProfileId: "pp-1" }
      })
    );
  });

  it("returns empty findings when birth and death dates are consistent", async () => {
    mockProfileResolver.resolveProfile.mockResolvedValueOnce("pp-1");
    lifeEventFindManyMock.mockResolvedValueOnce([
      {
        id: "e-birth",
        eventType: "BIRTH",
        year: 1980,
        month: 6,
        day: 1,
        place: null,
        citations: []
      },
      {
        id: "e-death",
        eventType: "DEATH",
        year: 2020,
        month: null,
        day: null,
        place: null,
        citations: []
      }
    ]);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService(mockProfileResolver);
    const result = await service.validatePersonLifeEvents("user-1", "p1");

    expect(result.findings).toEqual([]);
  });
});
