import { beforeEach, describe, expect, it, vi } from "vitest";

const personProfileUpsertMock = vi.fn();
const relationshipUpsertMock = vi.fn();
const relationshipDeleteManyMock = vi.fn();
const prismaTransactionMock = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
  callback({
    personProfile: { upsert: personProfileUpsertMock },
    relationship: { upsert: relationshipUpsertMock }
  })
);

vi.mock("../src/db/client.js", () => ({
  prisma: {
    $transaction: prismaTransactionMock,
    personProfile: {
      upsert: personProfileUpsertMock
    },
    relationship: {
      upsert: relationshipUpsertMock,
      deleteMany: relationshipDeleteManyMock
    }
  }
}));

describe("RelationshipService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates direct and inverse relationship records", async () => {
    relationshipUpsertMock
      .mockResolvedValueOnce({ id: "direct-id" })
      .mockResolvedValueOnce({ id: "inverse-id" });

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService();
    const result = await service.upsertRelationship("user-1", "p1", "p2", "CHILD_OF");

    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
    expect(personProfileUpsertMock).toHaveBeenCalledTimes(2);
    expect(personProfileUpsertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          userId_immichPersonId: {
            userId: "user-1",
            immichPersonId: "p1"
          }
        },
        create: expect.objectContaining({
          userId: "user-1",
          immichPersonId: "p1"
        })
      })
    );
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

  it("deletes direct and inverse edges for a typed delete", async () => {
    relationshipDeleteManyMock.mockResolvedValue({ count: 2 });

    const { RelationshipService } = await import("../src/relationships/service.js");
    const service = new RelationshipService();
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
});
