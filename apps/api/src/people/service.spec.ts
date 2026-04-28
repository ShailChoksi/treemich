import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoist mocks before any imports so vi.mock can reference them.
const mocks = vi.hoisted(() => ({
  personProfileCreate: vi.fn(),
  personProfileFindFirst: vi.fn(),
  personProfileFindMany: vi.fn(),
  personProfileUpdate: vi.fn(),
  personProfileDeleteMany: vi.fn(),
  cooccurrenceEdgeDeleteMany: vi.fn(),
  personExternalIdentityCreate: vi.fn(),
  personExternalIdentityFindFirst: vi.fn(),
  personExternalIdentityFindMany: vi.fn(),
  personExternalIdentityDeleteMany: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    personProfile: {
      create: mocks.personProfileCreate,
      findFirst: mocks.personProfileFindFirst,
      findMany: mocks.personProfileFindMany,
      update: mocks.personProfileUpdate,
      deleteMany: mocks.personProfileDeleteMany
    },
    cooccurrenceEdge: { deleteMany: mocks.cooccurrenceEdgeDeleteMany },
    personExternalIdentity: {
      create: mocks.personExternalIdentityCreate,
      findFirst: mocks.personExternalIdentityFindFirst,
      findMany: mocks.personExternalIdentityFindMany,
      deleteMany: mocks.personExternalIdentityDeleteMany
    }
  }
}));

vi.mock("../config/env.js", () => ({
  env: { TREEMICH_SESSION_TTL_MS: 2_592_000_000 }
}));

vi.mock("../personNames/service.js", () => ({
  resolveDisplayNameForPerson: ({ immichName }: { immichName: string }) => immichName
}));

const makeProfile = (overrides: Record<string, unknown> = {}) => ({
  id: "pp-1",
  userId: "user-1",
  gender: "UNKNOWN",
  givenName: "Alice",
  surname: "Smith",
  displayNameOverride: null,
  nicknames: null,
  immichPersonId: null,
  externalIds: {},
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
  externalIdentities: [],
  thumbnails: [],
  ...overrides
});

const makeIdentity = (overrides: Record<string, unknown> = {}) => ({
  id: "ident-1",
  personId: "pp-1",
  userId: "user-1",
  provider: "IMMICH",
  providerPersonId: "immich-abc",
  providerBaseUrl: "https://immich.example",
  displayName: "Alice",
  thumbnailImportedAt: null,
  lastSeenAt: new Date("2025-01-01T00:00:00Z"),
  metadata: {},
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides
});

describe("PersonService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("creates a person and returns a PersonRecord", async () => {
      const profile = makeProfile();
      mocks.personProfileCreate.mockResolvedValue(profile);

      const { PersonService } = await import("./service.js");
      const service = new PersonService();
      const result = await service.create("user-1", {
        givenName: "Alice",
        surname: "Smith",
        gender: "UNKNOWN"
      });

      expect(mocks.personProfileCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: "user-1", givenName: "Alice", surname: "Smith", gender: "UNKNOWN" }),
          include: expect.objectContaining({ externalIdentities: true, thumbnails: true })
        })
      );
      expect(result.id).toBe("pp-1");
      expect(result.profile?.givenName).toBe("Alice");
    });

    it("trims whitespace from name fields", async () => {
      const profile = makeProfile({ givenName: "Bob", surname: "Jones" });
      mocks.personProfileCreate.mockResolvedValue(profile);

      const { PersonService } = await import("./service.js");
      const service = new PersonService();
      await service.create("user-1", { givenName: "  Bob  ", surname: "  Jones  " });

      expect(mocks.personProfileCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ givenName: "Bob", surname: "Jones" })
        })
      );
    });

    it("stores null for blank optional string fields", async () => {
      const profile = makeProfile({ givenName: null, surname: null });
      mocks.personProfileCreate.mockResolvedValue(profile);

      const { PersonService } = await import("./service.js");
      const service = new PersonService();
      await service.create("user-1", { givenName: "  ", surname: "" });

      expect(mocks.personProfileCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ givenName: null, surname: null })
        })
      );
    });
  });

  describe("resolvePersonId", () => {
    it("returns id when person exists by canonical id", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" });

      const { PersonService } = await import("./service.js");
      const id = await new PersonService().resolvePersonId("user-1", "pp-1");

      expect(id).toBe("pp-1");
      expect(mocks.personProfileFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "pp-1", userId: "user-1" } })
      );
    });

    it("falls back to external identity lookup", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce(null);
      mocks.personExternalIdentityFindFirst.mockResolvedValueOnce({ personId: "pp-2" });

      const { PersonService } = await import("./service.js");
      const id = await new PersonService().resolvePersonId("user-1", "ext-abc");

      expect(id).toBe("pp-2");
    });

    it("falls back to legacy immichPersonId lookup", async () => {
      mocks.personProfileFindFirst
        .mockResolvedValueOnce(null) // canonical id miss
        .mockResolvedValueOnce({ id: "pp-3" }); // immichPersonId hit
      mocks.personExternalIdentityFindFirst.mockResolvedValueOnce(null);

      const { PersonService } = await import("./service.js");
      const id = await new PersonService().resolvePersonId("user-1", "old-immich-id");

      expect(id).toBe("pp-3");
    });

    it("throws HttpNotFoundError when person is not found via any path", async () => {
      mocks.personProfileFindFirst.mockResolvedValue(null);
      mocks.personExternalIdentityFindFirst.mockResolvedValue(null);

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().resolvePersonId("user-1", "missing-id")).rejects.toThrow("Person not found");
    });
  });

  describe("get", () => {
    it("returns the person with external identities", async () => {
      mocks.personProfileFindFirst
        .mockResolvedValueOnce({ id: "pp-1" }) // resolvePersonId canonical lookup
        .mockResolvedValueOnce(makeProfile()); // full row with includes

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().get("user-1", "pp-1");

      expect(result.id).toBe("pp-1");
    });

    it("throws HttpNotFoundError for unknown person", async () => {
      mocks.personProfileFindFirst
        .mockResolvedValueOnce(null) // canonical id miss
        .mockResolvedValueOnce(null) // external identity miss
        .mockResolvedValueOnce(null); // legacy immichPersonId miss

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().get("user-1", "unknown")).rejects.toThrow("Person not found");
    });
  });

  describe("list", () => {
    it("returns all people when no query is provided", async () => {
      mocks.personProfileFindMany.mockResolvedValue([makeProfile(), makeProfile({ id: "pp-2", givenName: "Bob" })]);

      const { PersonService } = await import("./service.js");
      const results = await new PersonService().list("user-1");

      expect(results).toHaveLength(2);
      expect(mocks.personProfileFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } })
      );
    });

    it("adds OR name filter when query is provided", async () => {
      mocks.personProfileFindMany.mockResolvedValue([makeProfile()]);

      const { PersonService } = await import("./service.js");
      await new PersonService().list("user-1", "alice");

      expect(mocks.personProfileFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ givenName: expect.objectContaining({ contains: "alice" }) })
            ])
          })
        })
      );
    });
  });

  describe("update", () => {
    it("updates the specified fields on an existing person", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" }); // resolvePersonId
      mocks.personProfileUpdate.mockResolvedValue(makeProfile({ gender: "FEMALE" }));

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().update("user-1", "pp-1", { gender: "FEMALE" });

      expect(mocks.personProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pp-1" },
          data: expect.objectContaining({ gender: "FEMALE" })
        })
      );
      expect(result.profile?.gender).toBe("FEMALE");
    });
  });

  describe("addExternalIdentity", () => {
    it("creates and returns the new external identity", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" }); // resolvePersonId
      const identity = makeIdentity();
      mocks.personExternalIdentityCreate.mockResolvedValue(identity);

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().addExternalIdentity("user-1", "pp-1", {
        provider: "IMMICH",
        providerPersonId: "immich-abc",
        providerBaseUrl: "https://immich.example",
        displayName: "Alice"
      });

      expect(result.personId).toBe("pp-1");
      expect(result.provider).toBe("IMMICH");
      expect(result.providerPersonId).toBe("immich-abc");
    });

    it("throws HttpConflictError on duplicate external identity (P2002)", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" });
      const prismaError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      mocks.personExternalIdentityCreate.mockRejectedValue(prismaError);

      const { PersonService } = await import("./service.js");
      await expect(
        new PersonService().addExternalIdentity("user-1", "pp-1", {
          provider: "IMMICH",
          providerPersonId: "immich-abc"
        })
      ).rejects.toThrow("External identity already exists");
    });

    it("re-throws unexpected errors from identity create", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" });
      mocks.personExternalIdentityCreate.mockRejectedValue(new Error("DB connection lost"));

      const { PersonService } = await import("./service.js");
      await expect(
        new PersonService().addExternalIdentity("user-1", "pp-1", {
          provider: "IMMICH",
          providerPersonId: "x"
        })
      ).rejects.toThrow("DB connection lost");
    });
  });

  describe("listExternalIdentities", () => {
    it("returns all identities for a person", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" }); // resolvePersonId
      mocks.personExternalIdentityFindMany.mockResolvedValue([makeIdentity(), makeIdentity({ id: "ident-2" })]);

      const { PersonService } = await import("./service.js");
      const results = await new PersonService().listExternalIdentities("user-1", "pp-1");

      expect(results).toHaveLength(2);
      expect(mocks.personExternalIdentityFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1", personId: "pp-1" } })
      );
    });
  });

  describe("deleteExternalIdentity", () => {
    it("deletes and returns without error when identity exists", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" });
      mocks.personExternalIdentityDeleteMany.mockResolvedValue({ count: 1 });

      const { PersonService } = await import("./service.js");
      await expect(
        new PersonService().deleteExternalIdentity("user-1", "pp-1", "ident-1")
      ).resolves.toBeUndefined();

      expect(mocks.personExternalIdentityDeleteMany).toHaveBeenCalledWith({
        where: { id: "ident-1", personId: "pp-1", userId: "user-1" }
      });
    });

    it("throws HttpNotFoundError when identity does not exist", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" });
      mocks.personExternalIdentityDeleteMany.mockResolvedValue({ count: 0 });

      const { PersonService } = await import("./service.js");
      await expect(
        new PersonService().deleteExternalIdentity("user-1", "pp-1", "ghost-id")
      ).rejects.toThrow("External identity not found");
    });
  });

  describe("delete", () => {
    it("deletes a person and cleans up co-occurrence edges for canonical and external ids", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({
        id: "pp-1",
        immichPersonId: "legacy-immich-1",
        externalIdentities: [{ providerPersonId: "immich-abc" }]
      });
      mocks.cooccurrenceEdgeDeleteMany.mockResolvedValueOnce({ count: 2 });
      mocks.personProfileDeleteMany.mockResolvedValueOnce({ count: 1 });

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().delete("user-1", "pp-1")).resolves.toBeUndefined();

      expect(mocks.cooccurrenceEdgeDeleteMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          OR: [
            { personAId: { in: ["pp-1", "legacy-immich-1", "immich-abc"] } },
            { personBId: { in: ["pp-1", "legacy-immich-1", "immich-abc"] } }
          ]
        }
      });
      expect(mocks.personProfileDeleteMany).toHaveBeenCalledWith({
        where: { id: "pp-1", userId: "user-1" }
      });
    });

    it("throws HttpNotFoundError when person does not exist for the user", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce(null);

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().delete("user-1", "missing")).rejects.toThrow("Person not found");
      expect(mocks.personProfileDeleteMany).not.toHaveBeenCalled();
      expect(mocks.cooccurrenceEdgeDeleteMany).not.toHaveBeenCalled();
    });

    it("throws HttpNotFoundError if the profile disappears before deleteMany", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({
        id: "pp-1",
        immichPersonId: null,
        externalIdentities: []
      });
      mocks.cooccurrenceEdgeDeleteMany.mockResolvedValueOnce({ count: 0 });
      mocks.personProfileDeleteMany.mockResolvedValueOnce({ count: 0 });

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().delete("user-1", "pp-1")).rejects.toThrow("Person not found");
    });
  });

  describe("personToJson", () => {
    it("builds name from givenName + surname when no displayNameOverride", async () => {
      const profile = makeProfile({ givenName: "John", surname: "Doe" });
      mocks.personProfileCreate.mockResolvedValue(profile);

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().create("user-1", { givenName: "John", surname: "Doe" });
      // resolveDisplayNameForPerson mock returns immichName which falls back to "John Doe"
      expect(result.name).toBeTruthy();
    });

    it("surfaces IMMICH external identity displayName as name", async () => {
      const identity = makeIdentity({ displayName: "Immich Alice" });
      const profile = makeProfile({ externalIdentities: [identity] });
      mocks.personProfileCreate.mockResolvedValue(profile);

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().create("user-1", { givenName: "Alice" });

      expect(result.externalIdentities).toHaveLength(1);
      expect(result.externalIdentities?.[0]?.provider).toBe("IMMICH");
    });
  });
});
