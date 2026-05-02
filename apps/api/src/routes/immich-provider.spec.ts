import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../services.js";
import { registerImmichProviderRoutes } from "./immich-provider.js";

const dbMocks = vi.hoisted(() => ({
  personExternalIdentityFindMany: vi.fn(),
  personExternalIdentityFindFirst: vi.fn(),
  personExternalIdentityCreate: vi.fn(),
  personExternalIdentityUpdate: vi.fn(),
  personThumbnailCreate: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    personExternalIdentity: {
      findMany: dbMocks.personExternalIdentityFindMany,
      findFirst: dbMocks.personExternalIdentityFindFirst,
      create: dbMocks.personExternalIdentityCreate,
      update: dbMocks.personExternalIdentityUpdate
    },
    personThumbnail: {
      create: dbMocks.personThumbnailCreate
    }
  }
}));

vi.mock("../evidence/mediaStorage.js", () => ({
  storeMediaBuffer: vi.fn().mockResolvedValue({
    storageKey: "thumb.jpg",
    storageUrl: "/api/evidence/media/file/thumb.jpg",
    checksum: "checksum",
    byteSize: 4
  })
}));

describe("Immich provider routes", () => {
  let app: FastifyInstance;
  const immichClient = {
    listPeople: vi.fn(),
    getPersonThumbnail: vi.fn(),
    dispose: vi.fn()
  };
  const personService = {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    syncImmichLabelledPeople: vi.fn()
  };
  const personDuplicateService = {
    recomputeCandidates: vi.fn()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    app.decorate("services", {
      authService: { requireLinkedSession: vi.fn() },
      immichClientFactory: { getClient: vi.fn(() => immichClient) },
      personService,
      personDuplicateService,
      cooccurrenceService: { triggerComputation: vi.fn() }
    } as unknown as AppServices);
    app.addHook("preHandler", async (request) => {
      request.auth = {
        user: { id: "user-1", email: "user@example.com", name: "User" },
        session: { id: "session-1", userId: "user-1", tokenHash: "hash", expiresAt: new Date() },
        linkedAccount: {
          id: "link-1",
          userId: "user-1",
          immichBaseUrl: "http://immich.test/api",
          immichUserId: "immich-user",
          immichEmail: "user@example.com",
          immichName: "User",
          encryptedAccessToken: "token",
          accessTokenIv: "iv",
          accessTokenTag: "tag",
          accessTokenExpiresAt: null,
          lastValidatedAt: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      } as never;
    });
    await app.register(registerImmichProviderRoutes);
  });

  afterEach(async () => {
    await app.close();
  });

  it("previews Immich people with Treemich match candidates", async () => {
    immichClient.listPeople.mockResolvedValue([{ id: "immich-1", name: "Jane Doe" }]);
    personService.list.mockResolvedValue([{ id: "p1", name: "Jane Doe" }]);
    dbMocks.personExternalIdentityFindMany.mockResolvedValue([]);

    const response = await app.inject({ method: "GET", url: "/providers/immich/people/preview" });

    expect(response.statusCode).toBe(200);
    expect(response.json().people[0].candidates[0]).toMatchObject({
      personId: "p1",
      reason: "exactName"
    });
  });

  it("creates a Treemich person, links identity, and imports thumbnail", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    personDuplicateService.recomputeCandidates.mockResolvedValue({
      candidates: [],
      summary: { created: 0, updated: 0, preservedDismissed: 0, pending: 0 }
    });
    immichClient.listPeople.mockResolvedValue([{ id: "immich-1", name: "Jane Doe" }]);
    immichClient.getPersonThumbnail.mockResolvedValue({
      contentType: "image/jpeg",
      data: Buffer.from("data")
    });
    personService.create.mockResolvedValue({ id: "p1", name: "Jane Doe" });
    dbMocks.personExternalIdentityFindFirst.mockResolvedValue(null);
    dbMocks.personExternalIdentityCreate.mockResolvedValue({
      id: "identity-1",
      personId: "p1",
      providerPersonId: "immich-1"
    });
    dbMocks.personThumbnailCreate.mockResolvedValue({
      id: "thumb-1",
      personId: "p1",
      source: "IMMICH",
      storageUrl: "/api/evidence/media/file/thumb.jpg",
      mimeType: "image/jpeg",
      checksum: "checksum",
      sourceExternalIdentityId: "identity-1",
      importedAt: now,
      createdAt: now,
      updatedAt: now
    });
    dbMocks.personExternalIdentityUpdate.mockResolvedValue({});

    const response = await app.inject({
      method: "POST",
      url: "/providers/immich/people/import",
      payload: {
        decisions: [{ action: "create", providerPersonId: "immich-1" }],
        importThumbnails: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(personService.create).toHaveBeenCalledWith("user-1", {
      givenName: "Jane",
      surname: "Doe",
      gender: "UNKNOWN"
    });
    expect(response.json().summary).toMatchObject({
      created: 1,
      thumbnailsImported: 1,
      duplicateRecompute: { status: "ok" }
    });
    expect(personDuplicateService.recomputeCandidates).toHaveBeenCalledWith("user-1");
  });

  it("does not fail manual Immich import when duplicate recompute throws", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    personDuplicateService.recomputeCandidates.mockRejectedValue(new Error("recompute unavailable"));
    immichClient.listPeople.mockResolvedValue([{ id: "immich-1", name: "Jane Doe" }]);
    immichClient.getPersonThumbnail.mockResolvedValue({
      contentType: "image/jpeg",
      data: Buffer.from("data")
    });
    personService.create.mockResolvedValue({ id: "p1", name: "Jane Doe" });
    dbMocks.personExternalIdentityFindFirst.mockResolvedValue(null);
    dbMocks.personExternalIdentityCreate.mockResolvedValue({
      id: "identity-1",
      personId: "p1",
      providerPersonId: "immich-1"
    });
    dbMocks.personThumbnailCreate.mockResolvedValue({
      id: "thumb-1",
      personId: "p1",
      source: "IMMICH",
      storageUrl: "/api/evidence/media/file/thumb.jpg",
      mimeType: "image/jpeg",
      checksum: "checksum",
      sourceExternalIdentityId: "identity-1",
      importedAt: now,
      createdAt: now,
      updatedAt: now
    });
    dbMocks.personExternalIdentityUpdate.mockResolvedValue({});

    const response = await app.inject({
      method: "POST",
      url: "/providers/immich/people/import",
      payload: {
        decisions: [{ action: "create", providerPersonId: "immich-1" }],
        importThumbnails: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().summary.duplicateRecompute).toEqual({
      status: "error",
      message: "recompute unavailable"
    });
    expect(personService.create).toHaveBeenCalled();
  });

  it("syncs labelled Immich people and disposes the client", async () => {
    immichClient.listPeople.mockResolvedValue([{ id: "immich-1", name: "Pat" }]);
    personService.syncImmichLabelledPeople.mockResolvedValue({
      created: 0,
      updated: 0,
      alreadyLinked: 1,
      skippedUnnamed: 0
    });

    const response = await app.inject({ method: "POST", url: "/providers/immich/people/sync" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      created: 0,
      duplicateRecompute: { status: "skipped" }
    });
    expect(personService.syncImmichLabelledPeople).toHaveBeenCalledWith(
      "user-1",
      [{ id: "immich-1", name: "Pat" }],
      { providerBaseUrl: "http://immich.test/api" }
    );
    expect(immichClient.dispose).toHaveBeenCalledTimes(1);
    expect(personDuplicateService.recomputeCandidates).not.toHaveBeenCalled();
  });

  it("recomputes duplicate candidates when sync creates people (errors are non-fatal)", async () => {
    immichClient.listPeople.mockResolvedValue([{ id: "immich-new", name: "New Face" }]);
    personService.syncImmichLabelledPeople.mockResolvedValue({
      created: 1,
      updated: 0,
      alreadyLinked: 0,
      skippedUnnamed: 0
    });
    personDuplicateService.recomputeCandidates.mockRejectedValue(new Error("db busy"));

    const response = await app.inject({ method: "POST", url: "/providers/immich/people/sync" });

    expect(response.statusCode).toBe(200);
    expect(response.json().duplicateRecompute).toEqual({
      status: "error",
      message: "db busy"
    });
    expect(personDuplicateService.recomputeCandidates).toHaveBeenCalledWith("user-1");
    expect(immichClient.dispose).toHaveBeenCalledTimes(1);
  });
});
