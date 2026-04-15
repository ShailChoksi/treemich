import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../src/services.js";

const upsertRelationshipMock = vi.fn();
const deleteRelationshipMock = vi.fn();
const upsertProfileMock = vi.fn();
const findTargetsByRelationshipMock = vi.fn();
const getProfilesForPersonIdsMock = vi.fn();
const getConnectedPersonIdsMock = vi.fn();
const listRelationshipsMock = vi.fn();
const getPhotoCooccurrenceMock = vi.fn();
const listPeopleMock = vi.fn();
const getPersonThumbnailMock = vi.fn();
const listAssetsWithPeopleMock = vi.fn();
const loginWithImmichMock = vi.fn();
const getAuthStateMock = vi.fn();
const requireSessionMock = vi.fn();
const logoutMock = vi.fn();
const getClientMock = vi.fn();
const queryRawMock = vi.fn();

vi.mock("../src/db/client.js", () => ({
  prisma: {
    $queryRaw: queryRawMock
  }
}));

describe("Treemich API routes", () => {
  let app: FastifyInstance;
  const authContext = {
    user: {
      id: "user-1",
      immichBaseUrl: "http://localhost:2283/api",
      immichUserId: "immich-user-1",
      immichEmail: "mike@example.com",
      immichName: "Mike",
      linkedAccount: {
        id: "link-1",
        userId: "user-1",
        immichBaseUrl: "http://localhost:2283/api",
        immichUserId: "immich-user-1",
        immichEmail: "mike@example.com",
        immichName: "Mike",
        encryptedAccessToken: "encrypted",
        accessTokenIv: "iv",
        accessTokenTag: "tag",
        accessTokenExpiresAt: null,
        lastValidatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    linkedAccount: {
      id: "link-1",
      userId: "user-1",
      immichBaseUrl: "http://localhost:2283/api",
      immichUserId: "immich-user-1",
      immichEmail: "mike@example.com",
      immichName: "Mike",
      encryptedAccessToken: "encrypted",
      accessTokenIv: "iv",
      accessTokenTag: "tag",
      accessTokenExpiresAt: null,
      lastValidatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    },
    session: {
      id: "session-1",
      userId: "user-1",
      tokenHash: "hash",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date()
    }
  };
  const immichClient = {
    listPeople: listPeopleMock,
    getPersonThumbnail: getPersonThumbnailMock,
    listAssetsWithPeople: listAssetsWithPeopleMock
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:54321/treemich_test";
    process.env.IMMICH_BASE_URL = "http://localhost:2283/api";
    process.env.TREEMICH_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.TREEMICH_SESSION_COOKIE_NAME = "treemich_session";
    queryRawMock.mockResolvedValue([1]);
    getClientMock.mockReturnValue(immichClient);
    requireSessionMock.mockResolvedValue(authContext);
    getAuthStateMock.mockResolvedValue({
      authenticated: false,
      linkStatus: {
        linked: false
      }
    });
  });

  beforeEach(async () => {
    const services: AppServices = {
      authService: {
        loginWithImmich: loginWithImmichMock,
        getAuthState: getAuthStateMock,
        requireSession: requireSessionMock,
        logout: logoutMock
      } as unknown as AppServices["authService"],
      immichClientFactory: {
        getClient: getClientMock
      } as unknown as AppServices["immichClientFactory"],
      relationshipService: {
        upsertRelationship: upsertRelationshipMock,
        deleteRelationship: deleteRelationshipMock,
        upsertProfile: upsertProfileMock,
        findTargetsByRelationship: findTargetsByRelationshipMock,
        getProfilesForPersonIds: getProfilesForPersonIdsMock,
        getConnectedPersonIds: getConnectedPersonIdsMock,
        listRelationships: listRelationshipsMock,
        getPhotoCooccurrence: getPhotoCooccurrenceMock
      } as unknown as AppServices["relationshipService"]
    };

    const { buildApp } = await import("../src/app.js");
    app = buildApp({ services });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("creates relationship edge", async () => {
    upsertRelationshipMock.mockResolvedValueOnce({
      direct: { id: "r1" },
      inverse: { id: "r2" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/people/p1/relationships",
      payload: {
        toPersonId: "p2",
        relationshipType: "CHILD_OF"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(upsertRelationshipMock).toHaveBeenCalledWith("user-1", "p1", "p2", "CHILD_OF");
  });

  it("deletes relationship edge", async () => {
    deleteRelationshipMock.mockResolvedValueOnce({ count: 2 });

    const response = await app.inject({
      method: "DELETE",
      url: "/people/p1/relationships?toPersonId=p2&type=CHILD_OF"
    });

    expect(response.statusCode).toBe(200);
    expect(deleteRelationshipMock).toHaveBeenCalledWith("user-1", "p1", "p2", "CHILD_OF");
    expect(response.json().deletedCount).toBe(2);
  });

  it("loads people via treemich backend", async () => {
    listPeopleMock.mockResolvedValueOnce([{ id: "p1", name: "Mike" }]);
    getProfilesForPersonIdsMock.mockResolvedValueOnce(new Map([["p1", { gender: "MALE" }]]));
    getConnectedPersonIdsMock.mockResolvedValueOnce(new Set(["p1"]));

    const response = await app.inject({
      method: "GET",
      url: "/people"
    });

    expect(response.statusCode).toBe(200);
    expect(getClientMock).toHaveBeenCalledWith(authContext.linkedAccount);
    const json = response.json();
    expect(json.people).toHaveLength(1);
    expect(json.people[0].name).toBe("Mike");
    expect(json.people[0].profile.gender).toBe("MALE");
    expect(json.people[0].hasRelationship).toBe(true);
  });

  it("updates gender profile", async () => {
    upsertProfileMock.mockResolvedValueOnce({
      immichPersonId: "p1",
      gender: "MALE",
      birthDateOverride: null
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/people/p1",
      payload: {
        gender: "MALE"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(upsertProfileMock).toHaveBeenCalledWith("user-1", "p1", {
      gender: "MALE",
      birthDateOverride: undefined
    });
  });

  it("lists saved relationships", async () => {
    listRelationshipsMock.mockResolvedValueOnce({
      relationships: [{ fromPersonId: "p1", toPersonId: "p2", type: "PARENT_OF" }],
      nextCursor: null
    });

    const response = await app.inject({
      method: "GET",
      url: "/relationships"
    });

    expect(response.statusCode).toBe(200);
    expect(listRelationshipsMock).toHaveBeenCalledWith("user-1", {
      cursor: undefined,
      limit: undefined
    });
    const json = response.json();
    expect(json.relationships).toHaveLength(1);
    expect(json.relationships[0].type).toBe("PARENT_OF");
    expect(json.nextCursor).toBeNull();
  });

  it("searches relatives from NL query", async () => {
    findTargetsByRelationshipMock.mockResolvedValueOnce([{ fromPersonId: "john-id" }]);
    getProfilesForPersonIdsMock.mockResolvedValueOnce(new Map([["john-id", { gender: "MALE" }]]));
    listPeopleMock.mockResolvedValueOnce([
      { id: "john-id", name: "John" },
      { id: "mike-id", name: "Mike" }
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/search?q=son%20of%20Mike"
    });

    expect(response.statusCode).toBe(200);
    expect(findTargetsByRelationshipMock).toHaveBeenCalledWith("user-1", ["mike-id"], "CHILD_OF");
    const json = response.json();
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].person.name).toBe("John");
  });

  it("returns unauthenticated state from auth/me without a session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/auth/me"
    });

    expect(response.statusCode).toBe(200);
    expect(getAuthStateMock).toHaveBeenCalledWith(null);
    expect(response.json()).toEqual({
      authenticated: false,
      linkStatus: {
        linked: false
      }
    });
    expect(response.headers["set-cookie"]).toContain("treemich_session=");
  });

  it("creates a session on auth/login", async () => {
    loginWithImmichMock.mockResolvedValueOnce({
      sessionToken: "session-token",
      state: {
        authenticated: true,
        user: {
          id: "user-1",
          immichUserId: "immich-user-1",
          email: "mike@example.com",
          name: "Mike"
        },
        linkStatus: {
          linked: true,
          immichBaseUrl: "http://localhost:2283/api",
          immichEmail: "mike@example.com",
          immichName: "Mike"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "mike@example.com",
        password: "secret"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(loginWithImmichMock).toHaveBeenCalledWith("mike@example.com", "secret");
    expect(response.headers["set-cookie"]).toContain("treemich_session=session-token");
  });

  it("requires auth for protected routes but still bypasses /health", async () => {
    const { TreemichAuthError } = await import("../src/auth/service.js");
    requireSessionMock.mockRejectedValueOnce(new TreemichAuthError("Unauthorized"));

    const protectedResponse = await app.inject({
      method: "GET",
      url: "/people"
    });
    expect(protectedResponse.statusCode).toBe(401);

    const healthResponse = await app.inject({
      method: "GET",
      url: "/health?probe=1"
    });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toEqual({ ok: true });
  });
});
