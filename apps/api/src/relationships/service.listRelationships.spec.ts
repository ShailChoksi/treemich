import { beforeEach, describe, expect, it, vi } from "vitest";

const relationshipFindMany = vi.fn();
const familyChildFindMany = vi.fn();

vi.mock("../db/client.js", () => ({
  prisma: {
    relationship: { findMany: relationshipFindMany },
    familyChild: { findMany: familyChildFindMany }
  }
}));

const mockLifeEventService = {
  getSpouseMarriageDivorceIsoForPairs: vi.fn().mockResolvedValue(new Map())
};

describe("RelationshipService.listRelationships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLifeEventService.getSpouseMarriageDivorceIsoForPairs.mockResolvedValue(new Map());
  });

  it("does not query familyChild when there are no family-scoped PARENT_OF edges", async () => {
    relationshipFindMany.mockResolvedValue([
      { id: "r1", fromPersonId: "a", toPersonId: "b", type: "SPOUSE_OF", familyId: null }
    ]);
    const { RelationshipService } = await import("./service.js");
    const service = new RelationshipService(mockLifeEventService as never);
    await service.listRelationships("user-1");
    expect(familyChildFindMany).toHaveBeenCalledTimes(0);
  });

  it("skips familyChild lookup when PARENT_OF has no familyId", async () => {
    relationshipFindMany.mockResolvedValue([
      { id: "r1", fromPersonId: "p1", toPersonId: "c1", type: "PARENT_OF", familyId: null }
    ]);
    const { RelationshipService } = await import("./service.js");
    const service = new RelationshipService(mockLifeEventService as never);
    await service.listRelationships("user-1");
    expect(familyChildFindMany).toHaveBeenCalledTimes(0);
  });

  it("queries familyChild for PARENT_OF rows with familyId and attaches childEdgePedigree", async () => {
    relationshipFindMany.mockResolvedValue([
      { id: "pe1", fromPersonId: "p1", toPersonId: "c1", type: "PARENT_OF", familyId: "fam-1" }
    ]);
    familyChildFindMany.mockResolvedValue([
      { familyId: "fam-1", childPersonId: "c1", pedigree: "ADOPTED" }
    ]);
    const { RelationshipService } = await import("./service.js");
    const service = new RelationshipService(mockLifeEventService as never);
    const result = await service.listRelationships("user-1");

    expect(familyChildFindMany).toHaveBeenCalledWith({
      where: {
        OR: [{ familyId: "fam-1", childPersonId: "c1" }]
      },
      select: {
        familyId: true,
        childPersonId: true,
        pedigree: true
      }
    });
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]).toMatchObject({
      id: "pe1",
      type: "PARENT_OF",
      childEdgePedigree: "ADOPTED"
    });
  });

  it("omits childEdgePedigree when FamilyChild row is missing", async () => {
    relationshipFindMany.mockResolvedValue([
      { id: "pe1", fromPersonId: "p1", toPersonId: "c1", type: "PARENT_OF", familyId: "fam-1" }
    ]);
    familyChildFindMany.mockResolvedValue([]);
    const { RelationshipService } = await import("./service.js");
    const service = new RelationshipService(mockLifeEventService as never);
    const result = await service.listRelationships("user-1");
    expect(Object.hasOwn(result.relationships[0] as object, "childEdgePedigree")).toBe(false);
  });

  it("still loads spouse marriage dates for SPOUSE_OF rows", async () => {
    relationshipFindMany.mockResolvedValue([
      { id: "s1", fromPersonId: "a", toPersonId: "b", type: "SPOUSE_OF", familyId: null }
    ]);
    const dates = new Map([
      ["a:b", { marriageAnniversaryDate: "2000-06-01", divorceDate: null as string | null }]
    ]);
    mockLifeEventService.getSpouseMarriageDivorceIsoForPairs.mockResolvedValue(dates);
    const { RelationshipService } = await import("./service.js");
    const service = new RelationshipService(mockLifeEventService as never);
    const result = await service.listRelationships("user-1");
    expect(mockLifeEventService.getSpouseMarriageDivorceIsoForPairs).toHaveBeenCalled();
    expect(result.relationships[0]).toMatchObject({
      marriageAnniversaryDate: "2000-06-01",
      divorceDate: null
    });
  });
});
