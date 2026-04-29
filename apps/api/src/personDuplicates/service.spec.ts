import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  candidateFindFirst: vi.fn(),
  candidateUpdate: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    personDuplicateCandidate: {
      findFirst: mocks.candidateFindFirst,
      update: mocks.candidateUpdate
    }
  }
}));

const candidateRow = {
  id: "dup-1",
  userId: "user-1",
  personAId: "p1",
  personBId: "p2",
  score: 85,
  reasons: [{ code: "name", label: "Same full name", weight: 45 }],
  status: "PENDING",
  dismissedAt: null,
  mergedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  personA: {
    id: "p1",
    displayNameOverride: null,
    givenName: "Alex",
    surname: "Smith",
    externalIdentities: [],
    lifeEvents: []
  },
  personB: {
    id: "p2",
    displayNameOverride: null,
    givenName: "Alexander",
    surname: "Smith",
    externalIdentities: [],
    lifeEvents: []
  }
};

describe("PersonDuplicateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects merging a person into itself before touching the database", async () => {
    const { PersonDuplicateService } = await import("./service.js");
    await expect(
      new PersonDuplicateService().mergePeople("user-1", "dup-1", "p1", "p1")
    ).rejects.toMatchObject({
      statusCode: 400
    });
    expect(mocks.candidateFindFirst).not.toHaveBeenCalled();
  });

  it("updates candidate review status and returns enriched candidate", async () => {
    mocks.candidateFindFirst.mockResolvedValueOnce({ id: "dup-1", userId: "user-1" }).mockResolvedValueOnce({
      ...candidateRow,
      status: "DISMISSED",
      dismissedAt: new Date("2026-01-02T00:00:00.000Z")
    });
    mocks.candidateUpdate.mockResolvedValueOnce({ id: "dup-1" });

    const { PersonDuplicateService } = await import("./service.js");
    const result = await new PersonDuplicateService().updateStatus("user-1", "dup-1", "DISMISSED");

    expect(mocks.candidateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dup-1" },
        data: expect.objectContaining({ status: "DISMISSED" })
      })
    );
    expect(result.status).toBe("DISMISSED");
    expect(result.personA.label).toBe("Alex Smith");
  });
});
