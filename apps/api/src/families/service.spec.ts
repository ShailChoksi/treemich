import { describe, expect, it, vi } from "vitest";
import type { RelationshipService } from "../relationships/service.js";
import type { PersonService } from "../people/service.js";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock("../db/client.js", () => ({
  prisma: {
    familyChild: {
      findMany: findManyMock
    }
  }
}));

const { FamilyService } = await import("./service.js");

describe("FamilyService.findAdoptedChildPersonIds", () => {
  const relationshipService = {} as unknown as RelationshipService;
  const personService = {} as unknown as PersonService;

  it("returns distinct adopted child ids for matching parents", async () => {
    findManyMock.mockResolvedValueOnce([
      { childPersonId: "c1" },
      { childPersonId: "c1" },
      { childPersonId: "c2" }
    ]);

    const service = new FamilyService(relationshipService, personService);
    const ids = await service.findAdoptedChildPersonIds("user-1", ["p1", "p2"]);

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
    const service = new FamilyService(relationshipService, personService);
    const ids = await service.findAdoptedChildPersonIds("user-1", []);
    expect(ids).toEqual([]);
    expect(findManyMock).toHaveBeenCalledTimes(0);
  });
});

describe("FamilyService.syncDerivedEdges", () => {
  it("creates parent-child edges in bulk with createMany", async () => {
    const upsertRelationshipMock = vi.fn().mockResolvedValue({});
    const relationshipService = {
      upsertRelationship: upsertRelationshipMock
    } as unknown as RelationshipService;
    const personService = {} as unknown as PersonService;
    const service = new FamilyService(relationshipService, personService);
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const createMany = vi.fn().mockResolvedValue({ count: 4 });

    await service.syncDerivedEdges(
      {
        relationship: {
          deleteMany,
          createMany
        }
      } as never,
      "user-1",
      "family-1",
      {
        parent1PersonId: "parent-a",
        parent2PersonId: "parent-b",
        children: [
          {
            id: "child-row-1",
            familyId: "family-1",
            childPersonId: "child-1",
            pedigree: "UNKNOWN",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z")
          }
        ]
      }
    );

    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1", familyId: "family-1" } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "user-1",
          fromPersonId: "parent-a",
          toPersonId: "child-1",
          type: "PARENT_OF",
          familyId: "family-1"
        },
        {
          userId: "user-1",
          fromPersonId: "child-1",
          toPersonId: "parent-a",
          type: "CHILD_OF",
          familyId: "family-1"
        },
        {
          userId: "user-1",
          fromPersonId: "parent-b",
          toPersonId: "child-1",
          type: "PARENT_OF",
          familyId: "family-1"
        },
        {
          userId: "user-1",
          fromPersonId: "child-1",
          toPersonId: "parent-b",
          type: "CHILD_OF",
          familyId: "family-1"
        }
      ],
      skipDuplicates: true
    });
    expect(upsertRelationshipMock).toHaveBeenCalledWith(
      "user-1",
      "parent-a",
      "parent-b",
      "SPOUSE_OF",
      expect.objectContaining({
        db: expect.any(Object)
      })
    );
  });
});
