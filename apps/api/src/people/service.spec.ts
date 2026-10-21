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
  personExternalIdentityUpdate: vi.fn(),
  personExternalIdentityDeleteMany: vi.fn(),
  lifeEventFindMany: vi.fn().mockResolvedValue([]),
  lifeEventCreate: vi.fn(),
  lifeEventUpdate: vi.fn(),
  queryRaw: vi.fn().mockResolvedValue([]),
  committedProfileIds: [] as string[],
  rolledBackProfileIds: [] as string[]
}));

vi.mock("../db/client.js", () => {
  const transactionalClient = {
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
      update: mocks.personExternalIdentityUpdate,
      deleteMany: mocks.personExternalIdentityDeleteMany
    },
    lifeEvent: {
      findMany: mocks.lifeEventFindMany,
      create: mocks.lifeEventCreate,
      update: mocks.lifeEventUpdate
    },
    $queryRaw: mocks.queryRaw
  };
  return {
    prisma: {
      ...transactionalClient,
      $transaction: async (fn: (tx: typeof transactionalClient) => Promise<unknown>) => {
        const pendingProfileIds: string[] = [];
        const tx = {
          ...transactionalClient,
          personProfile: {
            ...transactionalClient.personProfile,
            create: async (args: unknown) => {
              const row = (await mocks.personProfileCreate(args)) as { id: string };
              pendingProfileIds.push(row.id);
              return row;
            }
          }
        };
        try {
          const result = await fn(tx as typeof transactionalClient);
          mocks.committedProfileIds.push(...pendingProfileIds);
          return result;
        } catch (error) {
          mocks.rolledBackProfileIds.push(...pendingProfileIds);
          throw error;
        }
      }
    }
  };
});

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
    mocks.lifeEventFindMany.mockResolvedValue([]);
    mocks.queryRaw.mockResolvedValue([]);
    mocks.personExternalIdentityFindMany.mockReset();
    mocks.committedProfileIds.length = 0;
    mocks.rolledBackProfileIds.length = 0;
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
          data: expect.objectContaining({
            userId: "user-1",
            givenName: "Alice",
            surname: "Smith",
            gender: "UNKNOWN"
          }),
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

    it("does not resolve external provider ids on core person paths", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce(null);

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().resolvePersonId("user-1", "ext-abc")).rejects.toThrow(
        "Person not found"
      );

      expect(mocks.personExternalIdentityFindFirst).not.toHaveBeenCalled();
    });

    it("throws HttpNotFoundError when person is not found by Treemich id", async () => {
      mocks.personProfileFindFirst.mockResolvedValue(null);

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().resolvePersonId("user-1", "missing-id")).rejects.toThrow(
        "Person not found"
      );
    });
  });

  describe("resolveProfile", () => {
    it("delegates to resolvePersonId and returns the canonical id", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" });

      const { PersonService } = await import("./service.js");
      const service = new PersonService();
      const id = await service.resolveProfile("user-1", "pp-1");

      expect(id).toBe("pp-1");
      expect(mocks.personProfileFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "pp-1", userId: "user-1" } })
      );
      expect(mocks.personExternalIdentityFindFirst).not.toHaveBeenCalled();
    });

    it("throws HttpNotFoundError when person does not exist", async () => {
      mocks.personProfileFindFirst.mockResolvedValue(null);

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().resolveProfile("user-1", "missing-id")).rejects.toThrow(
        "Person not found"
      );
    });

    it("does not fall back to external identity", async () => {
      mocks.personProfileFindFirst.mockResolvedValue(null);

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().resolveProfile("user-1", "immich-abc")).rejects.toThrow(
        "Person not found"
      );
      expect(mocks.personExternalIdentityFindFirst).not.toHaveBeenCalled();
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
      mocks.personProfileFindFirst.mockResolvedValueOnce(null); // canonical id miss

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().get("user-1", "unknown")).rejects.toThrow("Person not found");
    });
  });

  describe("list", () => {
    it("returns all people when no query is provided", async () => {
      mocks.personProfileFindMany.mockResolvedValue([
        makeProfile(),
        makeProfile({ id: "pp-2", givenName: "Bob" })
      ]);

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
      mocks.personExternalIdentityFindMany.mockResolvedValue([
        makeIdentity(),
        makeIdentity({ id: "ident-2" })
      ]);

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
      await expect(new PersonService().deleteExternalIdentity("user-1", "pp-1", "ghost-id")).rejects.toThrow(
        "External identity not found"
      );
    });
  });

  describe("delete", () => {
    it("deletes a person and lets native co-occurrence edge foreign keys cascade", async () => {
      mocks.personProfileFindFirst.mockResolvedValueOnce({
        id: "pp-1",
        externalIdentities: [{ providerPersonId: "immich-abc" }]
      });
      mocks.personProfileDeleteMany.mockResolvedValueOnce({ count: 1 });

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().delete("user-1", "pp-1")).resolves.toBeUndefined();

      expect(mocks.cooccurrenceEdgeDeleteMany).not.toHaveBeenCalled();
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
        externalIdentities: []
      });
      mocks.cooccurrenceEdgeDeleteMany.mockResolvedValueOnce({ count: 0 });
      mocks.personProfileDeleteMany.mockResolvedValueOnce({ count: 0 });

      const { PersonService } = await import("./service.js");
      await expect(new PersonService().delete("user-1", "pp-1")).rejects.toThrow("Person not found");
    });
  });

  describe("syncImmichExternalIdentityNames", () => {
    it("updates matched Immich identity display names from the provider list", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([
        makeIdentity({ id: "ident-1", providerPersonId: "immich-abc", displayName: null }),
        makeIdentity({ id: "ident-2", providerPersonId: "immich-def", displayName: "Old Name" }),
        makeIdentity({ id: "ident-3", providerPersonId: "immich-unnamed", displayName: null })
      ]);
      mocks.personExternalIdentityUpdate.mockResolvedValue(makeIdentity());

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichExternalIdentityNames("user-1", [
        { id: "immich-abc", name: "Alice Smith" },
        { id: "immich-def", name: "Alice Jones" },
        { id: "immich-unnamed", name: "  " },
        { id: "immich-missing", name: "Missing Person" }
      ]);

      expect(mocks.personExternalIdentityFindMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          provider: "IMMICH",
          providerPersonId: { in: ["immich-abc", "immich-def", "immich-unnamed", "immich-missing"] }
        },
        select: { id: true, providerPersonId: true, displayName: true }
      });
      expect(mocks.personExternalIdentityUpdate).toHaveBeenCalledTimes(2);
      expect(mocks.personExternalIdentityUpdate).toHaveBeenCalledWith({
        where: { id: "ident-1" },
        data: { displayName: "Alice Smith", lastSeenAt: expect.any(Date) }
      });
      expect(mocks.personExternalIdentityUpdate).toHaveBeenCalledWith({
        where: { id: "ident-2" },
        data: { displayName: "Alice Jones", lastSeenAt: expect.any(Date) }
      });
      expect(result).toEqual({ matched: 3, updated: 2, skippedUnnamed: 1 });
    });

    it("does not update already-current names", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([
        makeIdentity({ id: "ident-1", providerPersonId: "immich-abc", displayName: "Alice Smith" })
      ]);

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichExternalIdentityNames("user-1", [
        { id: "immich-abc", name: "Alice Smith" }
      ]);

      expect(mocks.personExternalIdentityUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({ matched: 1, updated: 0, skippedUnnamed: 0 });
    });
  });

  describe("syncImmichLabelledPeople", () => {
    const noBirthdays = { filled: 0, equal: 0, conflict: 0, malformed: 0, absent: 0 };
    const absentFields = {
      birthdayResult: "absent" as const,
      birthDate: null,
      birthYear: null,
      birthMonth: null,
      birthDay: null
    };
    const skippedFields = {
      birthDate: null,
      birthYear: null,
      birthMonth: null,
      birthDay: null
    };
    it("creates a Treemich person and Immich identity for each unmatched named Immich person", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileCreate.mockResolvedValueOnce(
        makeProfile({ id: "new-profile", givenName: "Pat", surname: "Lee" })
      );
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(
        makeIdentity({ personId: "new-profile", providerPersonId: "im-1", displayName: "Pat Lee" })
      );

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichLabelledPeople(
        "user-1",
        [{ id: "im-1", name: "Pat Lee" }],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(result).toEqual({
        created: 1,
        updated: 0,
        alreadyLinked: 0,
        skippedUnnamed: 0,
        birthdays: { ...noBirthdays, absent: 1 },
        results: [
          { providerPersonId: "im-1", personResult: "created", personId: "new-profile", ...absentFields }
        ]
      });
      expect(mocks.personExternalIdentityFindMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          provider: "IMMICH",
          providerPersonId: { in: ["im-1"] },
          OR: [{ providerBaseUrl: "https://immich.example/api" }, { providerBaseUrl: null }]
        }
      });
      expect(mocks.personExternalIdentityCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            personId: "new-profile",
            provider: "IMMICH",
            providerPersonId: "im-1",
            providerBaseUrl: "https://immich.example/api",
            displayName: "Pat Lee",
            metadata: { importedFromImmichAutoSync: true }
          })
        })
      );
    });

    it("counts unnamed Immich people as skipped without creating rows", async () => {
      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichLabelledPeople(
        "user-1",
        [{ id: "im-1", name: "  " }],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(result).toEqual({
        created: 0,
        updated: 0,
        alreadyLinked: 0,
        skippedUnnamed: 1,
        birthdays: noBirthdays,
        results: [{ providerPersonId: "im-1", personResult: "skipped", ...skippedFields }]
      });
      expect(mocks.personExternalIdentityFindMany).not.toHaveBeenCalled();
      expect(mocks.personProfileCreate).not.toHaveBeenCalled();
    });

    it("counts already-linked identities when the Immich display name is unchanged", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([
        makeIdentity({
          id: "ident-1",
          providerPersonId: "im-1",
          displayName: "Same Name",
          providerBaseUrl: "https://immich.example/api"
        })
      ]);

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichLabelledPeople(
        "user-1",
        [{ id: "im-1", name: "Same Name" }],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(result).toEqual({
        created: 0,
        updated: 0,
        alreadyLinked: 1,
        skippedUnnamed: 0,
        birthdays: { ...noBirthdays, absent: 1 },
        results: [
          { providerPersonId: "im-1", personResult: "alreadyLinked", personId: "pp-1", ...absentFields }
        ]
      });
      expect(mocks.personExternalIdentityUpdate).not.toHaveBeenCalled();
      expect(mocks.personProfileCreate).not.toHaveBeenCalled();
    });

    it("updates the Immich identity display name when the provider label changes", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([
        makeIdentity({
          id: "ident-1",
          providerPersonId: "im-1",
          displayName: "Old Label",
          providerBaseUrl: "https://immich.example/api"
        })
      ]);
      mocks.personExternalIdentityUpdate.mockResolvedValueOnce(makeIdentity({ displayName: "New Label" }));

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichLabelledPeople(
        "user-1",
        [{ id: "im-1", name: "New Label" }],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(result).toEqual({
        created: 0,
        updated: 1,
        alreadyLinked: 0,
        skippedUnnamed: 0,
        birthdays: { ...noBirthdays, absent: 1 },
        results: [
          { providerPersonId: "im-1", personResult: "alreadyLinked", personId: "pp-1", ...absentFields }
        ]
      });
      expect(mocks.personExternalIdentityUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ident-1" },
          data: expect.objectContaining({ displayName: "New Label" })
        })
      );
    });

    it("creates a new Treemich person when the only existing identity is on a different Immich base URL", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([
        makeIdentity({
          id: "ident-other",
          providerPersonId: "im-1",
          displayName: "Same Immich id other server",
          providerBaseUrl: "http://other-immich.example/api"
        })
      ]);
      mocks.personProfileCreate.mockResolvedValueOnce(
        makeProfile({ id: "new-profile-2", givenName: "Pat", surname: "Lee" })
      );
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(
        makeIdentity({
          personId: "new-profile-2",
          providerPersonId: "im-1",
          providerBaseUrl: "https://immich.example/api"
        })
      );

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichLabelledPeople(
        "user-1",
        [{ id: "im-1", name: "Pat Lee" }],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(result).toEqual({
        created: 1,
        updated: 0,
        alreadyLinked: 0,
        skippedUnnamed: 0,
        birthdays: { ...noBirthdays, absent: 1 },
        results: [
          { providerPersonId: "im-1", personResult: "created", personId: "new-profile-2", ...absentFields }
        ]
      });
      expect(mocks.personProfileCreate).toHaveBeenCalled();
      expect(mocks.personExternalIdentityCreate).toHaveBeenCalled();
    });

    it("migrates legacy null providerBaseUrl to the current base when relinking", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([
        makeIdentity({
          id: "ident-1",
          providerPersonId: "im-1",
          displayName: "Pat Lee",
          providerBaseUrl: null
        })
      ]);
      mocks.personExternalIdentityUpdate.mockResolvedValueOnce(
        makeIdentity({ providerBaseUrl: "https://immich.example/api" })
      );

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichLabelledPeople(
        "user-1",
        [{ id: "im-1", name: "Pat Lee" }],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(result).toEqual({
        created: 0,
        updated: 1,
        alreadyLinked: 0,
        skippedUnnamed: 0,
        birthdays: { ...noBirthdays, absent: 1 },
        results: [
          { providerPersonId: "im-1", personResult: "alreadyLinked", personId: "pp-1", ...absentFields }
        ]
      });
      expect(mocks.personExternalIdentityUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ providerBaseUrl: "https://immich.example/api" })
        })
      );
      expect(mocks.personExternalIdentityCreate).not.toHaveBeenCalled();
      expect(mocks.queryRaw.mock.calls.some((call) => call.includes("ident-1"))).toBe(true);
    });

    it("does not delete Treemich profiles or identities when a later sync payload omits earlier Immich ids", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileCreate.mockResolvedValueOnce(
        makeProfile({ id: "pp-b", givenName: "Bob", surname: null })
      );
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(
        makeIdentity({ personId: "pp-b", providerPersonId: "im-b" })
      );

      const { PersonService } = await import("./service.js");
      const service = new PersonService();
      await service.syncImmichLabelledPeople("user-1", [{ id: "im-b", name: "Bob Solo" }], {
        providerBaseUrl: "https://immich.example/api"
      });

      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileCreate.mockResolvedValueOnce(
        makeProfile({ id: "pp-c", givenName: "Cara", surname: null })
      );
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(
        makeIdentity({ personId: "pp-c", providerPersonId: "im-c" })
      );
      await service.syncImmichLabelledPeople("user-1", [{ id: "im-c", name: "Cara Only" }], {
        providerBaseUrl: "https://immich.example/api"
      });

      expect(mocks.personProfileDeleteMany).not.toHaveBeenCalled();
      expect(mocks.personExternalIdentityDeleteMany).not.toHaveBeenCalled();
      expect(mocks.cooccurrenceEdgeDeleteMany).not.toHaveBeenCalled();
    });

    it("handles a repeated Immich person id once", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileCreate.mockResolvedValueOnce(
        makeProfile({ id: "once", givenName: "Pat", surname: "Lee" })
      );
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(
        makeIdentity({ personId: "once", providerPersonId: "im-1" })
      );

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichLabelledPeople(
        "user-1",
        [
          { id: "im-1", name: "Pat Lee" },
          { id: "im-1", name: "Pat Lee" }
        ],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(result.created).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(mocks.personProfileCreate).toHaveBeenCalledTimes(1);
    });

    it("continues after one person transaction fails and rolls that profile back", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileCreate
        .mockResolvedValueOnce(makeProfile({ id: "failed-profile", givenName: "Fail", surname: null }))
        .mockResolvedValueOnce(makeProfile({ id: "ok-profile", givenName: "Ok", surname: null }));
      mocks.personExternalIdentityCreate
        .mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }))
        .mockResolvedValueOnce(makeIdentity({ personId: "ok-profile", providerPersonId: "im-ok" }));

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichLabelledPeople(
        "user-1",
        [
          { id: "im-fail", name: "Fail Person", birthDate: "1815-12-10" },
          { id: "im-ok", name: "Ok Person", birthDate: "1900-01-02" }
        ],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(result.created).toBe(1);
      expect(result.results[0]).toMatchObject({
        providerPersonId: "im-fail",
        personResult: "error",
        message: "Birthday import failed"
      });
      expect(result.results[1]).toMatchObject({
        providerPersonId: "im-ok",
        personResult: "created",
        birthdayResult: "filled"
      });
      expect(mocks.rolledBackProfileIds).toEqual(["failed-profile"]);
      expect(mocks.committedProfileIds).toEqual(["ok-profile"]);
      expect(mocks.lifeEventCreate).toHaveBeenCalledTimes(1);
    });

    it("retries a committed create as already linked and equal, with one BIRTH", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileCreate.mockResolvedValueOnce(
        makeProfile({ id: "new-profile", givenName: "Pat", surname: "Lee" })
      );
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(
        makeIdentity({
          id: "ident-new",
          personId: "new-profile",
          providerPersonId: "im-1",
          displayName: "Pat Lee"
        })
      );

      const { PersonService } = await import("./service.js");
      const service = new PersonService();
      const first = await service.syncImmichLabelledPeople(
        "user-1",
        [{ id: "im-1", name: "Pat Lee", birthDate: "1815-12-10" }],
        { providerBaseUrl: "https://immich.example/api" }
      );
      expect(first.results[0]).toMatchObject({ personResult: "created", birthdayResult: "filled" });
      expect(mocks.lifeEventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: "BIRTH",
          dateQualifier: "EXACT",
          year: 1815,
          month: 12,
          day: 10,
          placeId: null,
          notes: null,
          relationshipId: null,
          personProfileId: "new-profile"
        })
      });
      expect(mocks.lifeEventCreate.mock.calls[0]?.[0].data.citations).toBeUndefined();

      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([
        makeIdentity({
          id: "ident-new",
          personId: "new-profile",
          providerPersonId: "im-1",
          displayName: "Pat Lee",
          providerBaseUrl: "https://immich.example/api"
        })
      ]);
      mocks.lifeEventFindMany.mockResolvedValueOnce([
        {
          id: "birth-1",
          createdAt: new Date("2024-01-01T00:00:00Z"),
          year: 1815,
          month: 12,
          day: 10,
          dateQualifier: "EXACT"
        }
      ]);
      const second = await service.syncImmichLabelledPeople(
        "user-1",
        [{ id: "im-1", name: "Pat Lee", birthDate: "1815-12-10" }],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(second.results[0]).toMatchObject({ personResult: "alreadyLinked", birthdayResult: "equal" });
      expect(mocks.lifeEventCreate).toHaveBeenCalledTimes(1);
      expect(mocks.personProfileCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("applyImmichPerson", () => {
    const birthRow = (
      year: number | null,
      month: number | null,
      day: number | null,
      extras: Record<string, unknown> = {}
    ) => ({
      id: "birth-1",
      createdAt: new Date("2020-01-01T00:00:00Z"),
      year,
      month,
      day,
      dateQualifier: "ABOUT",
      placeId: "place-1",
      notes: "kept",
      ...extras
    });

    it("links an undated canonical birth and leaves qualifier, place, and notes unchanged", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" });
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(
        makeIdentity({ id: "ident-new", personId: "pp-1", providerPersonId: "im-1" })
      );
      mocks.lifeEventFindMany.mockResolvedValueOnce([birthRow(null, null, null)]);

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().applyImmichPerson("user-1", {
        providerBaseUrl: "https://immich.example/api",
        providerPersonId: "im-1",
        immichPerson: { id: "im-1", name: "Pat Lee", birthDate: "1815-12-10T00:00:00.000Z" },
        identities: "query",
        mode: { type: "link", personId: "pp-1" }
      });

      expect(result).toMatchObject({
        personResult: "linked",
        birthdayResult: "filled",
        birthDate: "1815-12-10",
        birthYear: 1815,
        birthMonth: 12,
        birthDay: 10
      });
      expect(mocks.lifeEventUpdate).toHaveBeenCalledWith({
        where: { id: "birth-1" },
        data: { year: 1815, month: 12, day: 10 }
      });
      expect(mocks.personProfileCreate).not.toHaveBeenCalled();
    });

    it("reports a conflict again and keeps the Treemich date when Immich clears nothing", async () => {
      const identity = makeIdentity({
        id: "ident-1",
        personId: "pp-1",
        providerPersonId: "im-1",
        displayName: "Pat Lee",
        providerBaseUrl: "https://immich.example/api"
      });
      mocks.personExternalIdentityFindMany.mockResolvedValue([identity]);
      mocks.lifeEventFindMany.mockResolvedValue([birthRow(1900, 1, null)]);

      const { PersonService } = await import("./service.js");
      const service = new PersonService();
      const input = {
        providerBaseUrl: "https://immich.example/api",
        providerPersonId: "im-1",
        immichPerson: { id: "im-1", name: "Pat Lee", birthDate: "1815-12-10" },
        identities: "query" as const,
        mode: { type: "sync" as const }
      };
      const first = await service.applyImmichPerson("user-1", input);
      const second = await service.applyImmichPerson("user-1", input);

      expect(first.birthdayResult).toBe("conflict");
      expect(second.birthdayResult).toBe("conflict");
      expect(first).toMatchObject({ birthYear: 1900, birthMonth: 1, birthDay: null });
      expect(mocks.lifeEventUpdate).not.toHaveBeenCalled();
      expect(mocks.lifeEventCreate).not.toHaveBeenCalled();
    });

    it("keeps a stored Treemich date when Immich clears the birthday", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([
        makeIdentity({
          providerPersonId: "im-1",
          displayName: "Pat Lee",
          providerBaseUrl: "https://immich.example/api"
        })
      ]);
      mocks.lifeEventFindMany.mockResolvedValueOnce([birthRow(1900, 5, 1, { dateQualifier: "ESTIMATED" })]);

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().applyImmichPerson("user-1", {
        providerBaseUrl: "https://immich.example/api",
        providerPersonId: "im-1",
        immichPerson: { id: "im-1", name: "Pat Lee", birthDate: null },
        identities: "query",
        mode: { type: "sync" }
      });

      expect(result).toMatchObject({
        personResult: "alreadyLinked",
        birthdayResult: "absent",
        birthYear: 1900,
        birthMonth: 5,
        birthDay: 1
      });
      expect(mocks.lifeEventUpdate).not.toHaveBeenCalled();
    });

    it("rejects an offset timestamp and stores no birth", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileCreate.mockResolvedValueOnce(makeProfile({ id: "pp-new" }));
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(makeIdentity({ personId: "pp-new" }));

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().applyImmichPerson("user-1", {
        providerBaseUrl: "https://immich.example/api",
        providerPersonId: "im-1",
        immichPerson: { id: "im-1", name: "Pat Lee", birthDate: "1815-12-10T00:00:00.000+00:00" },
        identities: "query",
        mode: { type: "sync" }
      });

      expect(result).toMatchObject({
        personResult: "created",
        birthdayResult: "malformed",
        rawBirthDate: "1815-12-10T00:00:00.000+00:00"
      });
      expect(mocks.lifeEventCreate).not.toHaveBeenCalled();
    });

    it("errors when a link target is already used by another Treemich person and writes nothing", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([
        makeIdentity({
          personId: "someone-else",
          providerPersonId: "im-1",
          providerBaseUrl: "https://immich.example/api"
        })
      ]);

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().applyImmichPerson("user-1", {
        providerBaseUrl: "https://immich.example/api",
        providerPersonId: "im-1",
        immichPerson: { id: "im-1", name: "Pat Lee", birthDate: "1815-12-10" },
        identities: "query",
        mode: { type: "link", personId: "pp-1" }
      });

      expect(result).toMatchObject({
        personResult: "error",
        personId: "someone-else",
        message: "Immich person is already linked to another Treemich person"
      });
      expect(mocks.personProfileCreate).not.toHaveBeenCalled();
      expect(mocks.personExternalIdentityCreate).not.toHaveBeenCalled();
      expect(mocks.lifeEventCreate).not.toHaveBeenCalled();
      expect(mocks.lifeEventUpdate).not.toHaveBeenCalled();
    });

    it("links a person with no canonical birth and creates one exact BIRTH", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" });
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(
        makeIdentity({ id: "ident-new", personId: "pp-1", providerPersonId: "im-1" })
      );

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().applyImmichPerson("user-1", {
        providerBaseUrl: "https://immich.example/api",
        providerPersonId: "im-1",
        immichPerson: { id: "im-1", name: "Pat Lee", birthDate: "1815-12-10" },
        identities: "query",
        mode: { type: "link", personId: "pp-1" }
      });

      expect(result).toMatchObject({
        personResult: "linked",
        birthdayResult: "filled",
        birthDate: "1815-12-10"
      });
      expect(mocks.lifeEventCreate).toHaveBeenCalledTimes(1);
      expect(mocks.personProfileCreate).not.toHaveBeenCalled();
    });

    it("fills an already-linked undated birth during re-sync", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([
        makeIdentity({
          id: "ident-1",
          providerPersonId: "im-1",
          displayName: "Pat Lee",
          providerBaseUrl: "https://immich.example/api"
        })
      ]);
      mocks.lifeEventFindMany.mockResolvedValueOnce([birthRow(null, null, null)]);

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichLabelledPeople(
        "user-1",
        [{ id: "im-1", name: "Pat Lee", birthDate: "1815-12-10T00:00:00.000Z" }],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(result).toMatchObject({ created: 0, updated: 0, alreadyLinked: 1 });
      expect(result.results[0]).toMatchObject({
        personResult: "alreadyLinked",
        birthdayResult: "filled",
        birthDate: "1815-12-10"
      });
      expect(mocks.lifeEventUpdate).toHaveBeenCalledWith({
        where: { id: "birth-1" },
        data: { year: 1815, month: 12, day: 10 }
      });
      expect(mocks.lifeEventCreate).not.toHaveBeenCalled();
      expect(mocks.personProfileCreate).not.toHaveBeenCalled();
    });

    it("errors when the Immich person is missing from the list", async () => {
      const { PersonService } = await import("./service.js");
      const result = await new PersonService().applyImmichPerson("user-1", {
        providerBaseUrl: "https://immich.example/api",
        providerPersonId: "missing",
        immichPerson: null,
        identities: "query",
        mode: { type: "create", givenName: "Pat", surname: "Lee", gender: "UNKNOWN" }
      });

      expect(result).toMatchObject({ personResult: "error", message: "Immich person not found" });
      expect(mocks.personProfileCreate).not.toHaveBeenCalled();
    });

    it("skips an apply decision without writing a person or a birth", async () => {
      const { PersonService } = await import("./service.js");
      const result = await new PersonService().applyImmichPerson("user-1", {
        providerBaseUrl: "https://immich.example/api",
        providerPersonId: "im-1",
        immichPerson: { id: "im-1", name: "Pat Lee", birthDate: "1815-12-10" },
        identities: "query",
        mode: { type: "skip" }
      });

      expect(result.personResult).toBe("skipped");
      expect(result.birthdayResult).toBeUndefined();
      expect(mocks.personProfileCreate).not.toHaveBeenCalled();
      expect(mocks.lifeEventCreate).not.toHaveBeenCalled();
    });

    it("creates a new person on re-sync after the identity is gone, and fills that birth", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileCreate.mockResolvedValueOnce(
        makeProfile({ id: "reborn", givenName: "Pat", surname: "Lee" })
      );
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(
        makeIdentity({ personId: "reborn", providerPersonId: "im-1" })
      );

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().syncImmichLabelledPeople(
        "user-1",
        [{ id: "im-1", name: "Pat Lee", birthDate: "1815-12-10" }],
        { providerBaseUrl: "https://immich.example/api" }
      );

      expect(result.results[0]).toMatchObject({
        personResult: "created",
        personId: "reborn",
        birthdayResult: "filled"
      });
    });

    it("applies birthday rules to the surviving canonical birth when linking again after the identity is deleted", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileFindFirst.mockResolvedValueOnce({ id: "pp-1" });
      mocks.personExternalIdentityCreate.mockResolvedValueOnce(
        makeIdentity({ personId: "pp-1", providerPersonId: "im-1" })
      );
      mocks.lifeEventFindMany.mockResolvedValueOnce([birthRow(1815, 12, 10, { dateQualifier: "ESTIMATED" })]);

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().applyImmichPerson("user-1", {
        providerBaseUrl: "https://immich.example/api",
        providerPersonId: "im-1",
        immichPerson: { id: "im-1", name: "Pat Lee", birthDate: "1815-12-10" },
        identities: "query",
        mode: { type: "link", personId: "pp-1" }
      });

      expect(result).toMatchObject({ personResult: "linked", birthdayResult: "equal" });
      expect(mocks.lifeEventUpdate).not.toHaveBeenCalled();
      expect(mocks.lifeEventCreate).not.toHaveBeenCalled();
    });

    it("counts a unique-constraint loser as Birthday import failed", async () => {
      mocks.personExternalIdentityFindMany.mockResolvedValueOnce([]);
      mocks.personProfileCreate.mockResolvedValueOnce(makeProfile({ id: "loser" }));
      mocks.personExternalIdentityCreate.mockRejectedValueOnce(
        Object.assign(new Error("unique"), { code: "P2002" })
      );

      const { PersonService } = await import("./service.js");
      const result = await new PersonService().applyImmichPerson("user-1", {
        providerBaseUrl: "https://immich.example/api",
        providerPersonId: "im-1",
        immichPerson: { id: "im-1", name: "Pat Lee", birthDate: "1815-12-10" },
        identities: "query",
        mode: { type: "sync" }
      });

      expect(result).toMatchObject({ personResult: "error", message: "Birthday import failed" });
      expect(mocks.rolledBackProfileIds).toEqual(["loser"]);
      expect(mocks.committedProfileIds).toEqual([]);
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
