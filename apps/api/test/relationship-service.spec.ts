import { beforeEach, describe, expect, it, vi } from "vitest";

const personProfileFindFirstMock = vi.fn().mockResolvedValue(null);
const personProfileUpsertMock = vi.fn();
const personProfileUpdateMock = vi.fn();
const personExternalIdentityFindFirstMock = vi.fn().mockResolvedValue(null);
const relationshipUpsertMock = vi.fn();
const relationshipDeleteManyMock = vi.fn();
const relationshipFindManyMock = vi.fn();
const personProfileCreateMock = vi.fn().mockResolvedValue({ id: "created-id" });
const prismaTransactionMock = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
  callback({
    personProfile: {
      findFirst: personProfileFindFirstMock,
      upsert: personProfileUpsertMock,
      update: personProfileUpdateMock,
      create: personProfileCreateMock
    },
    personExternalIdentity: { findFirst: personExternalIdentityFindFirstMock },
    relationship: { upsert: relationshipUpsertMock }
  })
);

vi.mock("../src/db/client.js", () => ({
  prisma: {
    $transaction: prismaTransactionMock,
    personProfile: {
      findFirst: personProfileFindFirstMock,
      upsert: personProfileUpsertMock,
      update: personProfileUpdateMock
    },
    personExternalIdentity: { findFirst: personExternalIdentityFindFirstMock },
    relationship: {
      upsert: relationshipUpsertMock,
      deleteMany: relationshipDeleteManyMock,
      findMany: relationshipFindManyMock
    }
  }
}));

const mockLifeEventService = {
  getSpouseMarriageDivorceIsoForPairs: vi.fn().mockResolvedValue(new Map())
};

describe("RelationshipService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLifeEventService.getSpouseMarriageDivorceIsoForPairs.mockResolvedValue(new Map());
    // Default: resolve canonical PersonProfile by id so upsertProfile returns existing records.
    personProfileFindFirstMock.mockImplementation(async ({ where }: { where: { id?: string } }) => {
      if (where.id) return { id: where.id, userId: "user-1" };
      return null;
    });
    personProfileUpdateMock.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      userId: "user-1"
    }));
  });

  it("creates direct and inverse relationship records", async () => {
    relationshipUpsertMock
      .mockResolvedValueOnce({ id: "direct-id" })
      .mockResolvedValueOnce({ id: "inverse-id" });

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockLifeEventService as never);
    const result = await service.upsertRelationship("user-1", "p1", "p2", "CHILD_OF");

    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
    // upsertProfile now uses findFirst to require canonical Treemich person ids rather than upsert.
    expect(personProfileFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1", userId: "user-1" } })
    );
    expect(personProfileFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p2", userId: "user-1" } })
    );
    expect(personProfileUpsertMock).not.toHaveBeenCalled();
    expect(relationshipUpsertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          userId_fromPersonId_toPersonId_type: {
            userId: "user-1",
            fromPersonId: "p1",
            toPersonId: "p2",
            type: "CHILD_OF"
          }
        },
        create: expect.objectContaining({
          userId: "user-1",
          fromPersonId: "p1",
          toPersonId: "p2",
          type: "CHILD_OF"
        })
      })
    );
    expect(relationshipUpsertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "user-1",
          fromPersonId: "p2",
          toPersonId: "p1",
          type: "PARENT_OF"
        })
      })
    );
    expect(result).toEqual({
      direct: { id: "direct-id" },
      inverse: { id: "inverse-id" }
    });
  });

  it("creates symmetric direct and inverse records for friend relationships", async () => {
    relationshipUpsertMock
      .mockResolvedValueOnce({ id: "friend-direct-id" })
      .mockResolvedValueOnce({ id: "friend-inverse-id" });

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockLifeEventService as never);
    const result = await service.upsertRelationship("user-1", "p1", "p2", "FRIEND_OF");

    expect(relationshipUpsertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "user-1",
          fromPersonId: "p1",
          toPersonId: "p2",
          type: "FRIEND_OF"
        })
      })
    );
    expect(relationshipUpsertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "user-1",
          fromPersonId: "p2",
          toPersonId: "p1",
          type: "FRIEND_OF"
        })
      })
    );
    expect(result).toEqual({
      direct: { id: "friend-direct-id" },
      inverse: { id: "friend-inverse-id" }
    });
  });

  it("deletes direct and inverse edges for a typed delete", async () => {
    relationshipDeleteManyMock.mockResolvedValue({ count: 2 });

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockLifeEventService as never);
    const result = await service.deleteRelationship("user-1", "p1", "p2", "PARENT_OF");

    expect(relationshipDeleteManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          OR: [
            { fromPersonId: "p1", toPersonId: "p2", type: "PARENT_OF" },
            { fromPersonId: "p2", toPersonId: "p1", type: "CHILD_OF" }
          ]
        })
      })
    );
    expect(result).toEqual({ count: 2 });
  });

  describe("traverseRelationshipChain", () => {
    it("returns results for a single hop", async () => {
      relationshipFindManyMock.mockResolvedValueOnce([
        { fromPersonId: "sibling-1", toPersonId: "mike" },
        { fromPersonId: "sibling-2", toPersonId: "mike" }
      ]);

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.traverseRelationshipChain("user-1", ["mike"], ["SIBLING_OF"]);

      expect(result).toEqual(expect.arrayContaining(["sibling-1", "sibling-2"]));
      expect(result).toHaveLength(2);
      expect(relationshipFindManyMock).toHaveBeenCalledTimes(1);
    });

    it("chains two hops for uncle traversal", async () => {
      relationshipFindManyMock
        .mockResolvedValueOnce([{ fromPersonId: "parent-1", toPersonId: "mike" }])
        .mockResolvedValueOnce([
          { fromPersonId: "uncle-1", toPersonId: "parent-1" },
          { fromPersonId: "aunt-1", toPersonId: "parent-1" }
        ]);

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.traverseRelationshipChain("user-1", ["mike"], ["PARENT_OF", "SIBLING_OF"]);

      expect(result).toEqual(expect.arrayContaining(["uncle-1", "aunt-1"]));
      expect(result).toHaveLength(2);
      expect(relationshipFindManyMock).toHaveBeenCalledTimes(2);
    });

    it("chains three hops for cousin traversal", async () => {
      relationshipFindManyMock
        .mockResolvedValueOnce([{ fromPersonId: "parent-1", toPersonId: "mike" }])
        .mockResolvedValueOnce([{ fromPersonId: "uncle-1", toPersonId: "parent-1" }])
        .mockResolvedValueOnce([
          { fromPersonId: "cousin-1", toPersonId: "uncle-1" },
          { fromPersonId: "cousin-2", toPersonId: "uncle-1" }
        ]);

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.traverseRelationshipChain(
        "user-1",
        ["mike"],
        ["PARENT_OF", "SIBLING_OF", "CHILD_OF"]
      );

      expect(result).toEqual(expect.arrayContaining(["cousin-1", "cousin-2"]));
      expect(result).toHaveLength(2);
      expect(relationshipFindManyMock).toHaveBeenCalledTimes(3);
    });

    it("chains five hops for second cousin traversal", async () => {
      relationshipFindManyMock
        .mockResolvedValueOnce([{ fromPersonId: "parent-1", toPersonId: "mike" }])
        .mockResolvedValueOnce([{ fromPersonId: "grandparent-1", toPersonId: "parent-1" }])
        .mockResolvedValueOnce([{ fromPersonId: "great-uncle-1", toPersonId: "grandparent-1" }])
        .mockResolvedValueOnce([{ fromPersonId: "first-cousin-1", toPersonId: "great-uncle-1" }])
        .mockResolvedValueOnce([{ fromPersonId: "second-cousin-1", toPersonId: "first-cousin-1" }]);

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.traverseRelationshipChain(
        "user-1",
        ["mike"],
        ["PARENT_OF", "PARENT_OF", "SIBLING_OF", "CHILD_OF", "CHILD_OF"]
      );

      expect(result).toEqual(["second-cousin-1"]);
      expect(relationshipFindManyMock).toHaveBeenCalledTimes(5);
    });

    it("short-circuits when first hop returns no results", async () => {
      relationshipFindManyMock.mockResolvedValueOnce([]);

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.traverseRelationshipChain("user-1", ["mike"], ["PARENT_OF", "SIBLING_OF"]);

      expect(result).toEqual([]);
      expect(relationshipFindManyMock).toHaveBeenCalledTimes(1);
    });

    it("short-circuits when second hop returns no results", async () => {
      relationshipFindManyMock
        .mockResolvedValueOnce([{ fromPersonId: "parent-1", toPersonId: "mike" }])
        .mockResolvedValueOnce([]);

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.traverseRelationshipChain("user-1", ["mike"], ["PARENT_OF", "SIBLING_OF"]);

      expect(result).toEqual([]);
      expect(relationshipFindManyMock).toHaveBeenCalledTimes(2);
    });

    it("excludes the source person from results", async () => {
      relationshipFindManyMock.mockResolvedValueOnce([
        { fromPersonId: "mike", toPersonId: "mike" },
        { fromPersonId: "sibling-1", toPersonId: "mike" }
      ]);

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.traverseRelationshipChain("user-1", ["mike"], ["SIBLING_OF"]);

      expect(result).toEqual(["sibling-1"]);
    });

    it("deduplicates results when multiple paths lead to the same person", async () => {
      relationshipFindManyMock
        .mockResolvedValueOnce([
          { fromPersonId: "parent-1", toPersonId: "mike" },
          { fromPersonId: "parent-2", toPersonId: "mike" }
        ])
        .mockResolvedValueOnce([
          { fromPersonId: "shared-uncle", toPersonId: "parent-1" },
          { fromPersonId: "shared-uncle", toPersonId: "parent-2" }
        ]);

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.traverseRelationshipChain("user-1", ["mike"], ["PARENT_OF", "SIBLING_OF"]);

      expect(result).toEqual(["shared-uncle"]);
    });
  });

  describe("listRelationships", () => {
    it("omits marriage fields for non-spouse edges", async () => {
      relationshipFindManyMock.mockResolvedValueOnce([
        { id: "r1", fromPersonId: "p1", toPersonId: "p2", type: "CHILD_OF" }
      ]);

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.listRelationships("user-1");

      expect(mockLifeEventService.getSpouseMarriageDivorceIsoForPairs).toHaveBeenCalledWith("user-1", []);
      expect(result.relationships[0]).toEqual({
        id: "r1",
        fromPersonId: "p1",
        toPersonId: "p2",
        type: "CHILD_OF"
      });
    });

    it("requests spouse dates with lexicographically sorted pair keys (hi → lo edge on disk)", async () => {
      relationshipFindManyMock.mockResolvedValueOnce([
        { id: "rs", fromPersonId: "zebra", toPersonId: "apple", type: "SPOUSE_OF" }
      ]);
      mockLifeEventService.getSpouseMarriageDivorceIsoForPairs.mockResolvedValueOnce(
        new Map([["apple:zebra", { marriageAnniversaryDate: "2000-01-01", divorceDate: null }]])
      );

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.listRelationships("user-1");

      expect(mockLifeEventService.getSpouseMarriageDivorceIsoForPairs).toHaveBeenCalledWith("user-1", [
        { lo: "apple", hi: "zebra" }
      ]);
      expect(result.relationships[0]).toMatchObject({
        id: "rs",
        fromPersonId: "zebra",
        toPersonId: "apple",
        type: "SPOUSE_OF",
        marriageAnniversaryDate: "2000-01-01",
        divorceDate: null
      });
    });

    it("applies the same sorted pair to both directed SPOUSE_OF rows in one page", async () => {
      relationshipFindManyMock.mockResolvedValueOnce([
        { id: "r1", fromPersonId: "p1", toPersonId: "p2", type: "SPOUSE_OF" },
        { id: "r2", fromPersonId: "p2", toPersonId: "p1", type: "SPOUSE_OF" }
      ]);
      mockLifeEventService.getSpouseMarriageDivorceIsoForPairs.mockResolvedValueOnce(
        new Map([["p1:p2", { marriageAnniversaryDate: "2011-11-11", divorceDate: null }]])
      );

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.listRelationships("user-1");

      const pairs = mockLifeEventService.getSpouseMarriageDivorceIsoForPairs.mock.calls[0]?.[1] as {
        lo: string;
        hi: string;
      }[];
      expect(pairs).toEqual([
        { lo: "p1", hi: "p2" },
        { lo: "p1", hi: "p2" }
      ]);
      expect(result.relationships).toHaveLength(2);
      expect(result.relationships[0]).toMatchObject({
        marriageAnniversaryDate: "2011-11-11",
        divorceDate: null
      });
      expect(result.relationships[1]).toMatchObject({
        marriageAnniversaryDate: "2011-11-11",
        divorceDate: null
      });
    });

    it("returns nextCursor when more rows exist than limit", async () => {
      relationshipFindManyMock.mockResolvedValueOnce([
        { id: "cursor-a", fromPersonId: "p1", toPersonId: "p2", type: "SPOUSE_OF" },
        { id: "cursor-b", fromPersonId: "p2", toPersonId: "p3", type: "SPOUSE_OF" }
      ]);
      mockLifeEventService.getSpouseMarriageDivorceIsoForPairs.mockResolvedValueOnce(new Map());

      const { RelationshipService } = await import("../src/relationships/service.js");
      const service = new RelationshipService(mockLifeEventService as never);
      const result = await service.listRelationships("user-1", { limit: 1 });

      expect(result.relationships).toHaveLength(1);
      expect(result.nextCursor).toBe("cursor-a");
    });
  });

  it("evicts old photo co-occurrence cache entries when the user cache grows too large", async () => {
    const listAssetsWithPeopleMock = vi.fn().mockResolvedValue([{ assetId: "a1", personIds: ["p1", "p2"] }]);

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockLifeEventService as never);
    const immichClient = {
      listAssetsWithPeople: listAssetsWithPeopleMock
    } as const;

    for (let index = 0; index <= 100; index += 1) {
      await service.getPhotoCooccurrence(`user-${index}`, immichClient as never, {
        minSharedPhotos: 1,
        minScore: 0
      });
    }

    expect(listAssetsWithPeopleMock).toHaveBeenCalledTimes(101);

    await service.getPhotoCooccurrence("user-0", immichClient as never, {
      minSharedPhotos: 1,
      minScore: 0
    });

    expect(listAssetsWithPeopleMock).toHaveBeenCalledTimes(102);
  });
});
