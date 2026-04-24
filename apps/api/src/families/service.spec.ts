import { describe, expect, it, vi } from "vitest";
import type { RelationshipService } from "../relationships/service.js";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock("../db/client.js", () => ({
  prisma: {
    familyChild: {
      findMany: findManyMock
    }
  }
}));

const { FamilyService } = await import("./service.js");

describe("FamilyService.findAdoptedChildImmichPersonIds", () => {
  const relationshipService = {} as unknown as RelationshipService;

  it("returns distinct adopted child ids for matching parents", async () => {
    findManyMock.mockResolvedValueOnce([
      { childImmichPersonId: "c1" },
      { childImmichPersonId: "c1" },
      { childImmichPersonId: "c2" }
    ]);

    const service = new FamilyService(relationshipService);
    const ids = await service.findAdoptedChildImmichPersonIds("user-1", ["p1", "p2"]);

    expect(ids).toEqual(["c1", "c2"]);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pedigree: "ADOPTED",
          family: expect.objectContaining({
            userId: "user-1",
            OR: expect.any(Array)
          })
        })
      })
    );
  });

  it("returns empty list when no parent ids", async () => {
    findManyMock.mockClear();
    const service = new FamilyService(relationshipService);
    const ids = await service.findAdoptedChildImmichPersonIds("user-1", []);
    expect(ids).toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
