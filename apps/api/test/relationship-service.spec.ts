import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpNotFoundError } from "../src/lifeEvents/errors.js";

const personProfileFindFirstMock = vi.fn();
const personProfileFindManyMock = vi.fn();
const relationshipUpsertMock = vi.fn();
const relationshipDeleteManyMock = vi.fn();
const relationshipFindManyMock = vi.fn();
const relationshipFindFirstMock = vi.fn();
const familyChildFindManyMock = vi.fn();

const txPersonProfileFindFirstOrThrowMock = vi.fn();
const txRelationshipUpsertMock = vi.fn();

const prismaTransactionMock = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
  callback({
    personProfile: {
      findFirstOrThrow: txPersonProfileFindFirstOrThrowMock
    },
    relationship: { upsert: txRelationshipUpsertMock }
  })
);

vi.mock("../src/db/client.js", () => ({
  prisma: {
    $transaction: prismaTransactionMock,
    personProfile: {
      findFirst: personProfileFindFirstMock,
      findMany: personProfileFindManyMock
    },
    relationship: {
      upsert: relationshipUpsertMock,
      deleteMany: relationshipDeleteManyMock,
      findMany: relationshipFindManyMock,
      findFirst: relationshipFindFirstMock
    },
    familyChild: {
      findMany: familyChildFindManyMock
    }
  }
}));

const mockLifeEventService = {
  getSpouseMarriageDivorceIsoForPairs: vi.fn().mockResolvedValue(new Map())
};

const mockProfileResolver = {
  resolveProfile: vi.fn().mockImplementation(async (_userId: string, id: string) => {
    if (id === "p1" || id === "p2") {
      return { id };
    }
    throw new HttpNotFoundError("Person not found");
  })
};

describe("RelationshipService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockLifeEventService.getSpouseMarriageDivorceIsoForPairs.mockResolvedValue(new Map());

    mockProfileResolver.resolveProfile.mockImplementation(async (_userId: string, id: string) => {
      if (id === "p1" || id === "p2") {
        return { id };
      }
      throw new HttpNotFoundError("Person not found");
    });

    txPersonProfileFindFirstOrThrowMock.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "p1" || where.id === "p2") {
        return { id: where.id, userId: "user-1" };
      }
      throw new Error("Record not found");
    });

    txRelationshipUpsertMock.mockImplementation((args: unknown) => args);
    familyChildFindManyMock.mockResolvedValue([]);
  });

  it("creates direct and inverse relationship records", async () => {
    txRelationshipUpsertMock
      .mockResolvedValueOnce({ id: "direct-id" })
      .mockResolvedValueOnce({ id: "inverse-id" });

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.upsertRelationship("user-1", "p1", "p2", "CHILD_OF");

    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);

    expect(mockProfileResolver.resolveProfile).toHaveBeenCalledWith("user-1", "p1", expect.any(Object));
    expect(mockProfileResolver.resolveProfile).toHaveBeenCalledWith("user-1", "p2", expect.any(Object));

    expect(txRelationshipUpsertMock).toHaveBeenNthCalledWith(
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
    expect(txRelationshipUpsertMock).toHaveBeenNthCalledWith(
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
    expect(result).toEqual({ direct: { id: "direct-id" }, inverse: { id: "inverse-id" } });
  });

  it("creates symmetric direct and inverse records for friend relationships", async () => {
    txRelationshipUpsertMock
      .mockResolvedValueOnce({ id: "friend-direct-id" })
      .mockResolvedValueOnce({ id: "friend-inverse-id" });

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.upsertRelationship("user-1", "p1", "p2", "FRIEND_OF");

    expect(txRelationshipUpsertMock).toHaveBeenNthCalledWith(
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
    expect(txRelationshipUpsertMock).toHaveBeenNthCalledWith(
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
    expect(result).toEqual({ direct: { id: "friend-direct-id" }, inverse: { id: "friend-inverse-id" } });
  });

  it("rejects unknown person id with Person not found", async () => {
    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);

    await expect(service.upsertRelationship("user-1", "unknown", "p2", "CHILD_OF")).rejects.toThrow(
      "Person not found"
    );
  });

  it("deletes direct and inverse edges for a typed delete", async () => {
    relationshipDeleteManyMock.mockResolvedValue({ count: 2 });

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.deleteRelationship("user-1", "p1", "p2", "PARENT_OF");

    expect(relationshipDeleteManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          familyId: null,
          OR: [
            { fromPersonId: "p1", toPersonId: "p2", type: "PARENT_OF" },
            { fromPersonId: "p2", toPersonId: "p1", type: "CHILD_OF" }
          ]
        })
      })
    );
    expect(result.count).toBe(2);
  });

  it("deletes all non-family edges when type is omitted", async () => {
    relationshipDeleteManyMock.mockResolvedValue({ count: 1 });

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.deleteRelationship("user-1", "p1", "p2");

    expect(relationshipDeleteManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          familyId: null,
          OR: [
            { fromPersonId: "p1", toPersonId: "p2" },
            { fromPersonId: "p2", toPersonId: "p1" }
          ]
        })
      })
    );
    expect(result.count).toBe(1);
  });

  it("hasSpouseRelationship returns true when a SPOUSE_OF edge exists either direction", async () => {
    relationshipFindFirstMock.mockResolvedValueOnce({ id: "spouse-edge" });

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.hasSpouseRelationship("user-1", "p1", "p2");

    expect(result).toBe(true);
    expect(relationshipFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", type: "SPOUSE_OF" }),
        select: { id: true }
      })
    );
  });

  it("hasSpouseRelationship returns false when no SPOUSE_OF edge exists", async () => {
    relationshipFindFirstMock.mockResolvedValueOnce(null);

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.hasSpouseRelationship("user-1", "p1", "p2");

    expect(result).toBe(false);
  });

  it("traverseRelationshipChain returns connected persons through hops", async () => {
    relationshipFindManyMock
      .mockResolvedValueOnce([{ id: "r1", fromPersonId: "p3", toPersonId: "p1", type: "SPOUSE_OF" }])
      .mockResolvedValueOnce([{ id: "r2", fromPersonId: "p5", toPersonId: "p3", type: "PARENT_OF" }]);

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.traverseRelationshipChain("user-1", ["p1"], ["SPOUSE_OF", "PARENT_OF"]);

    expect(result).toEqual(["p5"]);
  });

  it("traverseRelationshipChain deduplicates source persons", async () => {
    relationshipFindManyMock.mockResolvedValueOnce([
      { id: "r1", fromPersonId: "p1", toPersonId: "p1", type: "SPOUSE_OF" }
    ]);

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.traverseRelationshipChain("user-1", ["p1"], ["SPOUSE_OF"]);

    expect(result).toEqual([]);
  });

  it("getProfilesForPersonIds returns Map keyed by profile id", async () => {
    personProfileFindManyMock.mockResolvedValueOnce([
      { id: "p1", userId: "user-1", givenName: "Alice" },
      { id: "p2", userId: "user-1", givenName: "Bob" }
    ]);

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.getProfilesForPersonIds("user-1", ["p1", "p2"]);

    expect(result.get("p1")?.givenName).toBe("Alice");
    expect(result.get("p2")?.givenName).toBe("Bob");
  });

  it("getConnectedPersonIds returns all person ids from relationships", async () => {
    relationshipFindManyMock.mockResolvedValueOnce([
      { fromPersonId: "p1", toPersonId: "p2" },
      { fromPersonId: "p2", toPersonId: "p3" }
    ]);

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.getConnectedPersonIds("user-1", ["p1", "p2"]);

    expect(result.size).toBe(3);
    expect(result.has("p1")).toBe(true);
    expect(result.has("p2")).toBe(true);
    expect(result.has("p3")).toBe(true);
  });

  it("getConnectedPersonIds returns empty set for empty input", async () => {
    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.getConnectedPersonIds("user-1", []);

    expect(result.size).toBe(0);
  });

  it("listRelationships returns paginated results", async () => {
    relationshipFindManyMock.mockResolvedValueOnce([
      { id: "r1", fromPersonId: "p1", toPersonId: "p2", type: "SPOUSE_OF", familyId: null },
      { id: "r2", fromPersonId: "p1", toPersonId: "p3", type: "FRIEND_OF", familyId: null }
    ]);

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService(mockProfileResolver, mockLifeEventService as never);
    const result = await service.listRelationships("user-1", { limit: 10 });

    expect(result.relationships).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });
});
