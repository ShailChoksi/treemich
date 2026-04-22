import { beforeEach, describe, expect, it, vi } from "vitest";

const relationshipFindManyMock = vi.fn();
const lifeEventFindManyMock = vi.fn();

vi.mock("../db/client.js", () => ({
  prisma: {
    relationship: { findMany: relationshipFindManyMock },
    lifeEvent: { findMany: lifeEventFindManyMock }
  }
}));

describe("LifeEventService.getSpouseMarriageDivorceIsoForPairs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not query when pairs is empty", async () => {
    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService();
    const result = await service.getSpouseMarriageDivorceIsoForPairs("user-1", []);
    expect(result.size).toBe(0);
    expect(relationshipFindManyMock).toHaveBeenCalledTimes(0);
  });

  it("fills null dates for requested pairs when no spouse rows exist", async () => {
    relationshipFindManyMock.mockResolvedValueOnce([]);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService();
    const result = await service.getSpouseMarriageDivorceIsoForPairs("user-1", [{ lo: "a", hi: "b" }]);

    expect(relationshipFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          type: "SPOUSE_OF",
          OR: [
            { fromPersonId: "a", toPersonId: "b" },
            { fromPersonId: "b", toPersonId: "a" }
          ]
        })
      })
    );
    expect(lifeEventFindManyMock).toHaveBeenCalledTimes(0);
    expect(result.get("a:b")).toEqual({ marriageAnniversaryDate: null, divorceDate: null });
  });

  it("reads MARRIAGE and DIVORCE from life events on the canonical directed row (lo → hi)", async () => {
    relationshipFindManyMock.mockResolvedValueOnce([
      { id: "rel-canonical", fromPersonId: "a", toPersonId: "z", type: "SPOUSE_OF" }
    ]);
    lifeEventFindManyMock.mockResolvedValueOnce([
      { relationshipId: "rel-canonical", eventType: "MARRIAGE", year: 2005, month: 6, day: 15 },
      { relationshipId: "rel-canonical", eventType: "DIVORCE", year: 2010, month: 1, day: 2 }
    ]);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService();
    const result = await service.getSpouseMarriageDivorceIsoForPairs("user-1", [{ lo: "a", hi: "z" }]);

    expect(result.get("a:z")).toEqual({
      marriageAnniversaryDate: "2005-06-15",
      divorceDate: "2010-01-02"
    });
  });

  it("resolves the same normalized key when only the reverse SPOUSE_OF row exists (hi → lo)", async () => {
    relationshipFindManyMock.mockResolvedValueOnce([
      { id: "rel-reverse", fromPersonId: "z", toPersonId: "a", type: "SPOUSE_OF" }
    ]);
    lifeEventFindManyMock.mockResolvedValueOnce([
      { relationshipId: "rel-reverse", eventType: "MARRIAGE", year: 1999, month: 12, day: 31 }
    ]);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService();
    const result = await service.getSpouseMarriageDivorceIsoForPairs("user-1", [{ lo: "a", hi: "z" }]);

    expect(result.get("a:z")).toEqual({
      marriageAnniversaryDate: "1999-12-31",
      divorceDate: null
    });
  });

  it("merges marriage/divorce from two directed rows for the same pair", async () => {
    relationshipFindManyMock.mockResolvedValueOnce([
      { id: "rel-lo-hi", fromPersonId: "a", toPersonId: "z", type: "SPOUSE_OF" },
      { id: "rel-hi-lo", fromPersonId: "z", toPersonId: "a", type: "SPOUSE_OF" }
    ]);
    lifeEventFindManyMock.mockResolvedValueOnce([
      { relationshipId: "rel-lo-hi", eventType: "MARRIAGE", year: 2001, month: 1, day: 1 },
      { relationshipId: "rel-hi-lo", eventType: "DIVORCE", year: 2002, month: 2, day: 2 }
    ]);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService();
    const result = await service.getSpouseMarriageDivorceIsoForPairs("user-1", [{ lo: "a", hi: "z" }]);

    expect(result.get("a:z")).toEqual({
      marriageAnniversaryDate: "2001-01-01",
      divorceDate: "2002-02-02"
    });
  });

  it("deduplicates identical pair entries in the input list", async () => {
    relationshipFindManyMock.mockResolvedValueOnce([
      { id: "rel-1", fromPersonId: "x", toPersonId: "y", type: "SPOUSE_OF" }
    ]);
    lifeEventFindManyMock.mockResolvedValueOnce([]);

    const { LifeEventService } = await import("./service.js");
    const service = new LifeEventService();
    await service.getSpouseMarriageDivorceIsoForPairs("user-1", [
      { lo: "x", hi: "y" },
      { lo: "x", hi: "y" }
    ]);

    expect(relationshipFindManyMock).toHaveBeenCalledTimes(1);
    const orClause = relationshipFindManyMock.mock.calls[0]?.[0]?.where?.OR as unknown[];
    expect(orClause).toHaveLength(2);
  });
});
