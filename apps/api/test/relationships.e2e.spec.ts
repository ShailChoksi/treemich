import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../src/services.js";

const upsertRelationshipMock = vi.fn();
const deleteRelationshipMock = vi.fn();
const upsertProfileMock = vi.fn();
const findTargetsByRelationshipMock = vi.fn();
const traverseRelationshipChainMock = vi.fn();
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
        traverseRelationshipChain: traverseRelationshipChainMock,
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
    traverseRelationshipChainMock.mockResolvedValueOnce(["john-id"]);
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
    expect(traverseRelationshipChainMock).toHaveBeenCalledWith("user-1", ["mike-id"], ["CHILD_OF"]);
    const json = response.json();
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].person.name).toBe("John");
  });

  describe("search with multi-hop and filters", () => {
    it("searches siblings with gender filter", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["sarah-id", "bob-id"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(
        new Map([
          ["sarah-id", { gender: "FEMALE" }],
          ["bob-id", { gender: "MALE" }]
        ])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "sarah-id", name: "Sarah" },
        { id: "bob-id", name: "Bob" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=sisters%20of%20Mike"
      });

      expect(response.statusCode).toBe(200);
      expect(traverseRelationshipChainMock).toHaveBeenCalledWith("user-1", ["mike-id"], ["SIBLING_OF"]);
      const json = response.json();
      expect(json.matches).toHaveLength(1);
      expect(json.matches[0].person.name).toBe("Sarah");
    });

    it("searches uncles via 2-hop traversal", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["uncle-id", "aunt-id"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(
        new Map([
          ["uncle-id", { gender: "MALE" }],
          ["aunt-id", { gender: "FEMALE" }]
        ])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "uncle-id", name: "Uncle Bob" },
        { id: "aunt-id", name: "Aunt Lisa" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=uncle%20of%20Mike"
      });

      expect(response.statusCode).toBe(200);
      expect(traverseRelationshipChainMock).toHaveBeenCalledWith(
        "user-1",
        ["mike-id"],
        ["PARENT_OF", "SIBLING_OF"]
      );
      const json = response.json();
      expect(json.matches).toHaveLength(1);
      expect(json.matches[0].person.name).toBe("Uncle Bob");
    });

    it("searches cousins via 3-hop traversal", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["cousin-1", "cousin-2"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(
        new Map([
          ["cousin-1", { gender: "FEMALE" }],
          ["cousin-2", { gender: "MALE" }]
        ])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "cousin-1", name: "Emma" },
        { id: "cousin-2", name: "Jack" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=cousins%20of%20Mike"
      });

      expect(response.statusCode).toBe(200);
      expect(traverseRelationshipChainMock).toHaveBeenCalledWith(
        "user-1",
        ["mike-id"],
        ["PARENT_OF", "SIBLING_OF", "CHILD_OF"]
      );
      const json = response.json();
      expect(json.matches).toHaveLength(2);
    });

    it("searches second cousins via 5-hop traversal", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["sc-1"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(new Map([["sc-1", { gender: "MALE" }]]));
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "sc-1", name: "Distant Dan" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=second%20cousins%20of%20Mike"
      });

      expect(response.statusCode).toBe(200);
      expect(traverseRelationshipChainMock).toHaveBeenCalledWith(
        "user-1",
        ["mike-id"],
        ["PARENT_OF", "PARENT_OF", "SIBLING_OF", "CHILD_OF", "CHILD_OF"]
      );
      const json = response.json();
      expect(json.matches).toHaveLength(1);
    });

    it("applies gender prefix filter", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["c-1", "c-2"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(
        new Map([
          ["c-1", { gender: "FEMALE" }],
          ["c-2", { gender: "MALE" }]
        ])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "c-1", name: "Cousin Anna" },
        { id: "c-2", name: "Cousin Mark" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=female%20cousins%20of%20Mike"
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.matches).toHaveLength(1);
      expect(json.matches[0].person.name).toBe("Cousin Anna");
    });

    it("applies age filter and excludes people without birthdate", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["c-young", "c-old", "c-nodate"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(
        new Map([
          ["c-young", { gender: "MALE", birthDateOverride: "2010-06-15" }],
          ["c-old", { gender: "FEMALE", birthDateOverride: "1980-01-01" }],
          ["c-nodate", { gender: "MALE", birthDateOverride: null }]
        ])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "c-young", name: "Young Cousin" },
        { id: "c-old", name: "Old Cousin" },
        { id: "c-nodate", name: "No Date Cousin" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=cousins%20of%20Mike%20older%20than%2020"
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.matches).toHaveLength(1);
      expect(json.matches[0].person.name).toBe("Old Cousin");
    });

    it("applies born-in-year filter", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["a-1", "a-2"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(
        new Map([
          ["a-1", { gender: "FEMALE", birthDateOverride: "2005-03-10" }],
          ["a-2", { gender: "FEMALE", birthDateOverride: "1990-07-20" }]
        ])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "a-1", name: "Aunt 2005" },
        { id: "a-2", name: "Aunt 1990" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=aunts%20of%20Mike%20born%20in%202005"
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.matches).toHaveLength(1);
      expect(json.matches[0].person.name).toBe("Aunt 2005");
    });

    it("applies combined gender prefix and age suffix", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["sc-f-old", "sc-m-old", "sc-f-young"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(
        new Map([
          ["sc-f-old", { gender: "FEMALE", birthDateOverride: "1990-01-01" }],
          ["sc-m-old", { gender: "MALE", birthDateOverride: "1985-01-01" }],
          ["sc-f-young", { gender: "FEMALE", birthDateOverride: "2015-01-01" }]
        ])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "sc-f-old", name: "Older Female SC" },
        { id: "sc-m-old", name: "Older Male SC" },
        { id: "sc-f-young", name: "Younger Female SC" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=female%20second%20cousins%20of%20Mike%20older%20than%2020"
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.matches).toHaveLength(1);
      expect(json.matches[0].person.name).toBe("Older Female SC");
    });

    it("returns empty matches when source person not found", async () => {
      listPeopleMock.mockResolvedValueOnce([{ id: "mike-id", name: "Mike" }]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=sisters%20of%20Nobody"
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.matches).toHaveLength(0);
      expect(json.message).toContain("Nobody");
    });

    it("returns empty matches when traversal yields no results", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce([]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(new Map());
      listPeopleMock.mockResolvedValueOnce([{ id: "mike-id", name: "Mike" }]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=sisters%20of%20Mike"
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.matches).toHaveLength(0);
    });

    it("returns 400 for unsupported queries", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/search?q=friends%20of%20Mike"
      });

      expect(response.statusCode).toBe(400);
    });

    it("falls back to immich birthDate when profile has no override", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["c-1"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(
        new Map([["c-1", { gender: "MALE", birthDateOverride: null }]])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "c-1", name: "Cousin With Immich Date", birthDate: "1990-05-15" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=cousins%20of%20Mike%20born%20in%201990"
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.matches).toHaveLength(1);
      expect(json.matches[0].person.name).toBe("Cousin With Immich Date");
    });
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

  it("ignores malformed session cookies instead of crashing auth/me", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: "treemich_session=%ZZ"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(getAuthStateMock).toHaveBeenCalledWith(null);
    expect(response.json()).toEqual({
      authenticated: false,
      linkStatus: {
        linked: false
      }
    });
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

  it("rate limits auth/login more strictly than the global API limit", async () => {
    loginWithImmichMock.mockResolvedValue({
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

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "mike@example.com",
          password: "secret"
        }
      });

      expect(response.statusCode).toBe(200);
    }

    const rateLimitedResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "mike@example.com",
        password: "secret"
      }
    });

    expect(rateLimitedResponse.statusCode).toBe(429);
  });

  it("requires auth for protected routes with a consistent error shape but still bypasses /health", async () => {
    const { TreemichAuthError } = await import("../src/auth/service.js");
    requireSessionMock.mockRejectedValueOnce(new TreemichAuthError("Unauthorized"));

    const protectedResponse = await app.inject({
      method: "GET",
      url: "/people"
    });
    expect(protectedResponse.statusCode).toBe(401);
    expect(protectedResponse.json()).toEqual({
      statusCode: 401,
      error: "Unauthorized"
    });

    const healthResponse = await app.inject({
      method: "GET",
      url: "/health?probe=1"
    });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toEqual({ ok: true });
  });
});
