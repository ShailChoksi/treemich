import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../services.js";
import { registerImmichProviderRoutes } from "./immich-provider.js";

const dbMocks = vi.hoisted(() => ({
  personExternalIdentityFindMany: vi.fn(),
  personExternalIdentityFindFirst: vi.fn(),
  personExternalIdentityCreate: vi.fn(),
  personExternalIdentityUpdate: vi.fn(),
  personThumbnailCreate: vi.fn(),
  lifeEventFindMany: vi.fn().mockResolvedValue([])
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
    },
    lifeEvent: {
      findMany: dbMocks.lifeEventFindMany
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
    syncImmichLabelledPeople: vi.fn(),
    applyImmichPerson: vi.fn()
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
    personService.applyImmichPerson.mockResolvedValue({
      providerPersonId: "immich-1",
      personResult: "created",
      personId: "p1",
      birthdayResult: "absent",
      birthDate: null,
      birthYear: null,
      birthMonth: null,
      birthDay: null,
      metadataUpdated: false,
      identityId: "identity-1"
    });
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
    expect(personService.applyImmichPerson).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        providerPersonId: "immich-1",
        mode: expect.objectContaining({ type: "create", gender: "UNKNOWN" })
      })
    );
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
    personService.applyImmichPerson.mockResolvedValue({
      providerPersonId: "immich-1",
      personResult: "created",
      personId: "p1",
      birthdayResult: "absent",
      birthDate: null,
      birthYear: null,
      birthMonth: null,
      birthDay: null,
      metadataUpdated: false,
      identityId: "identity-1"
    });
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
    expect(personService.applyImmichPerson).toHaveBeenCalled();
  });

  it("syncs labelled Immich people and disposes the client", async () => {
    immichClient.listPeople.mockResolvedValue([{ id: "immich-1", name: "Pat" }]);
    personService.syncImmichLabelledPeople.mockResolvedValue({
      created: 0,
      updated: 0,
      alreadyLinked: 1,
      skippedUnnamed: 0,
      birthdays: { filled: 0, equal: 0, conflict: 0, malformed: 0, absent: 1 },
      results: [
        {
          providerPersonId: "immich-1",
          personResult: "alreadyLinked",
          birthdayResult: "absent",
          birthDate: null,
          birthYear: null,
          birthMonth: null,
          birthDay: null
        }
      ]
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
      skippedUnnamed: 0,
      birthdays: { filled: 0, equal: 0, conflict: 0, malformed: 0, absent: 1 },
      results: [
        {
          providerPersonId: "immich-new",
          personResult: "created",
          birthdayResult: "absent",
          birthDate: null,
          birthYear: null,
          birthMonth: null,
          birthDay: null
        }
      ]
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

  it("predicts birthday results on the preview", async () => {
    immichClient.listPeople.mockResolvedValue([
      { id: "immich-new", name: "Ada Lovelace", birthDate: "1815-12-10T00:00:00.000Z" },
      { id: "immich-blank", name: "  ", birthDate: "1900-01-01" },
      { id: "immich-bad", name: "Bad Date", birthDate: "not-a-date" },
      { id: "immich-linked", name: "Dee", birthDate: "1990-01-01" }
    ]);
    personService.list.mockResolvedValue([{ id: "p1", name: "Dee" }]);
    dbMocks.personExternalIdentityFindMany.mockResolvedValue([
      {
        providerPersonId: "immich-linked",
        personId: "p-dee",
        person: { displayNameOverride: null, givenName: "Dee", surname: null }
      }
    ]);
    dbMocks.lifeEventFindMany.mockResolvedValue([
      {
        id: "birth-dee",
        personProfileId: "p-dee",
        createdAt: new Date("2020-01-01T00:00:00Z"),
        year: 1980,
        month: 5,
        day: 5
      }
    ]);

    const response = await app.inject({ method: "GET", url: "/providers/immich/people/preview" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.people[0]).toMatchObject({
      birthDate: "1815-12-10",
      birthdayResult: "filled",
      birthYear: null
    });
    expect(body.people[0].personResult).toBeUndefined();
    expect(body.people[1]).toMatchObject({ personResult: "skipped" });
    expect(body.people[1].birthdayResult).toBeUndefined();
    expect(body.people[2]).toMatchObject({
      birthdayResult: "malformed",
      rawBirthDate: "not-a-date",
      birthDate: null
    });
    expect(body.people[3]).toMatchObject({
      personResult: "alreadyLinked",
      birthdayResult: "conflict",
      birthYear: 1980,
      birthMonth: 5,
      birthDay: 5
    });
    expect(body.totals.birthdays).toEqual({ filled: 1, equal: 0, conflict: 1, malformed: 1, absent: 0 });
  });

  it("returns 200 when one import person errors and the next succeeds", async () => {
    immichClient.listPeople.mockResolvedValue([
      { id: "missing", name: "Missing" },
      { id: "immich-ok", name: "Ok Person" }
    ]);
    personService.applyImmichPerson
      .mockResolvedValueOnce({
        providerPersonId: "missing",
        personResult: "error",
        message: "Immich person not found",
        birthDate: null,
        birthYear: null,
        birthMonth: null,
        birthDay: null,
        metadataUpdated: false
      })
      .mockResolvedValueOnce({
        providerPersonId: "immich-ok",
        personResult: "created",
        personId: "p-ok",
        birthdayResult: "filled",
        birthDate: "1900-01-01",
        birthYear: 1900,
        birthMonth: 1,
        birthDay: 1,
        metadataUpdated: false,
        identityId: "ident-ok"
      });

    const response = await app.inject({
      method: "POST",
      url: "/providers/immich/people/import",
      payload: {
        decisions: [
          { action: "create", providerPersonId: "missing" },
          { action: "create", providerPersonId: "immich-ok" }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().results[0]).toMatchObject({
      status: "error",
      personResult: "error",
      message: "Immich person not found"
    });
    expect(response.json().results[1]).toMatchObject({ status: "created", personResult: "created" });
    expect(response.json().summary.errors).toBe(1);
    expect(response.json().summary.created).toBe(1);
  });

  it("returns 400 naming the invalid apply field", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/providers/immich/people/import",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("decisions");
    expect(personService.applyImmichPerson).not.toHaveBeenCalled();
  });

  it("returns 401 without the token when Immich rejects the linked account", async () => {
    const { ImmichAuthenticationError } = await import("../integrations/immich/client.js");
    immichClient.listPeople.mockRejectedValue(
      new ImmichAuthenticationError("Immich listPeople requires a fresh login")
    );

    const response = await app.inject({ method: "GET", url: "/providers/immich/people/preview" });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe("Link or refresh your Immich account.");
    expect(JSON.stringify(response.json())).not.toContain("token");
    expect(personService.applyImmichPerson).not.toHaveBeenCalled();
    expect(personService.syncImmichLabelledPeople).not.toHaveBeenCalled();
  });

  it("returns 502 with the Immich status code and without the response body", async () => {
    const { ImmichUpstreamError } = await import("../integrations/immich/client.js");
    immichClient.listPeople.mockRejectedValue(new ImmichUpstreamError("listPeople", 503));

    const response = await app.inject({ method: "POST", url: "/providers/immich/people/sync" });

    expect(response.statusCode).toBe(502);
    expect(response.json().message).toContain("503");
    expect(response.json().message).not.toContain("secret-body");
    expect(personService.syncImmichLabelledPeople).not.toHaveBeenCalled();
  });

  it("logs the request id and omits the birth date and token", async () => {
    const lines: string[] = [];
    const loggedApp = Fastify({
      logger: {
        level: "debug",
        stream: {
          write: (message: string) => {
            lines.push(message);
          }
        }
      }
    });
    loggedApp.decorate("services", {
      authService: { requireLinkedSession: vi.fn() },
      immichClientFactory: { getClient: vi.fn(() => immichClient) },
      personService,
      personDuplicateService,
      cooccurrenceService: { triggerComputation: vi.fn() }
    } as unknown as AppServices);
    loggedApp.addHook("preHandler", async (request) => {
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
          encryptedAccessToken: "super-secret-token",
          accessTokenIv: "iv",
          accessTokenTag: "tag",
          accessTokenExpiresAt: null,
          lastValidatedAt: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      } as never;
    });
    await loggedApp.register(registerImmichProviderRoutes);
    immichClient.listPeople.mockResolvedValue([{ id: "immich-1", name: "Ada", birthDate: "1815-12-10" }]);
    personService.list.mockResolvedValue([]);
    dbMocks.personExternalIdentityFindMany.mockResolvedValue([]);

    const response = await loggedApp.inject({ method: "GET", url: "/providers/immich/people/preview" });
    await loggedApp.close();

    expect(response.statusCode).toBe(200);
    const logged = lines.join("\n");
    expect(logged).toContain("[immich-birthday]");
    expect(logged).toContain("user-1");
    expect(logged).toContain("requestId=");
    expect(logged).not.toContain("1815-12-10");
    expect(logged).not.toContain("super-secret-token");
  });

  it("returns 401 when the Immich account is not linked and starts no person import", async () => {
    const { TreemichAuthError } = await import("../auth/service.js");
    const unlinked = Fastify();
    unlinked.decorate("services", {
      authService: {
        requireLinkedSession: vi.fn().mockRejectedValue(new TreemichAuthError("Unauthorized"))
      },
      immichClientFactory: { getClient: vi.fn(() => immichClient) },
      personService,
      personDuplicateService,
      cooccurrenceService: { triggerComputation: vi.fn() }
    } as unknown as AppServices);
    unlinked.addHook("preHandler", async (request) => {
      request.auth = {
        user: { id: "user-1", email: "user@example.com", name: "User" },
        session: { id: "session-1", userId: "user-1", tokenHash: "hash", expiresAt: new Date() }
      } as never;
    });
    await unlinked.register(registerImmichProviderRoutes);

    const response = await unlinked.inject({ method: "GET", url: "/providers/immich/people/preview" });
    await unlinked.close();

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe("Link or refresh your Immich account.");
    expect(JSON.stringify(response.json())).not.toContain("token");
    expect(immichClient.listPeople).not.toHaveBeenCalled();
    expect(personService.applyImmichPerson).not.toHaveBeenCalled();
    expect(personService.syncImmichLabelledPeople).not.toHaveBeenCalled();
  });

  it("keeps the person result when thumbnail import fails", async () => {
    personDuplicateService.recomputeCandidates.mockResolvedValue({
      candidates: [],
      summary: { created: 0, updated: 0, preservedDismissed: 0, pending: 0 }
    });
    immichClient.listPeople.mockResolvedValue([{ id: "immich-1", name: "Jane Doe" }]);
    immichClient.getPersonThumbnail.mockRejectedValue(new Error("thumbnail missing"));
    personService.applyImmichPerson.mockResolvedValue({
      providerPersonId: "immich-1",
      personResult: "created",
      personId: "p1",
      birthdayResult: "filled",
      birthDate: "1815-12-10",
      birthYear: 1815,
      birthMonth: 12,
      birthDay: 10,
      metadataUpdated: false,
      identityId: "identity-1"
    });

    const response = await app.inject({
      method: "POST",
      url: "/providers/immich/people/import",
      payload: {
        decisions: [{ action: "create", providerPersonId: "immich-1" }],
        importThumbnails: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().results[0]).toMatchObject({ personResult: "created", status: "created" });
    expect(response.json().summary.thumbnailsImported).toBe(0);
    expect(response.json().summary.created).toBe(1);
  });
});
