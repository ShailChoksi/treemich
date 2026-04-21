import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { HttpConflictError, HttpValidationError } from "../src/lifeEvents/errors.js";
import type { AppServices } from "../src/services.js";

const upsertRelationshipMock = vi.fn();
const updateSpouseRelationshipDatesMock = vi.fn();
const deleteRelationshipMock = vi.fn();
const upsertProfileMock = vi.fn();
const findTargetsByRelationshipMock = vi.fn();
const traverseRelationshipChainMock = vi.fn();
const getProfilesForPersonIdsMock = vi.fn();
const getConnectedPersonIdsMock = vi.fn();
const listRelationshipsMock = vi.fn();
const getPhotoCooccurrenceMock = vi.fn();
const triggerCooccurrenceComputationMock = vi.fn();
const getCooccurrenceStatusMock = vi.fn();
const queryCooccurrenceEdgesMock = vi.fn();
const getCooccurrenceEdgeBetweenMock = vi.fn();
const getPersistedPhotoCooccurrenceMock = vi.fn();
const syncCooccurrenceScheduleFromPreferencesMock = vi.fn();
const listPeopleMock = vi.fn();
const getPersonThumbnailMock = vi.fn();
const listAssetsWithPeopleMock = vi.fn();
const loginWithImmichMock = vi.fn();
const getAuthStateMock = vi.fn();
const requireSessionMock = vi.fn();
const logoutMock = vi.fn();
const getClientMock = vi.fn();
const queryRawMock = vi.fn();
const treemichUserFindUniqueOrThrowMock = vi.fn();
const treemichUserUpdateMock = vi.fn();
const lifeEventServiceMock = {
  getBirthDeathByPersonProfileIds: vi.fn().mockResolvedValue(new Map()),
  syncLegacyPersonProfileFields: vi.fn().mockResolvedValue(undefined),
  syncLegacySpouseDates: vi.fn().mockResolvedValue(undefined),
  listPersonLifeEvents: vi.fn().mockResolvedValue([]),
  createPersonLifeEvent: vi.fn(),
  updatePersonLifeEvent: vi.fn(),
  deletePersonLifeEvent: vi.fn(),
  listRelationshipLifeEvents: vi.fn().mockResolvedValue([]),
  createRelationshipLifeEvent: vi.fn(),
  updateRelationshipLifeEvent: vi.fn(),
  deleteRelationshipLifeEvent: vi.fn()
};

vi.mock("../src/db/client.js", () => ({
  prisma: {
    $queryRaw: queryRawMock,
    treemichUser: {
      findUniqueOrThrow: treemichUserFindUniqueOrThrowMock,
      update: treemichUserUpdateMock
    }
  }
}));

describe("Treemich API routes", () => {
  let app: FastifyInstance;
  const defaultCooccurrencePreferences = {
    refreshEnabled: true,
    refreshIntervalDays: 7
  };
  const defaultShowSingleFamilyTree = false;
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
    lifeEventServiceMock.getBirthDeathByPersonProfileIds.mockResolvedValue(new Map());
    lifeEventServiceMock.syncLegacyPersonProfileFields.mockResolvedValue(undefined);
    lifeEventServiceMock.syncLegacySpouseDates.mockResolvedValue(undefined);
    lifeEventServiceMock.listPersonLifeEvents.mockResolvedValue([]);
    lifeEventServiceMock.listRelationshipLifeEvents.mockResolvedValue([]);
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:54321/treemich_test";
    process.env.IMMICH_BASE_URL = "http://localhost:2283/api";
    process.env.TREEMICH_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.TREEMICH_SESSION_COOKIE_NAME = "treemich_session";
    queryRawMock.mockResolvedValue([1]);
    getClientMock.mockReturnValue(immichClient);
    requireSessionMock.mockResolvedValue(authContext);
    syncCooccurrenceScheduleFromPreferencesMock.mockResolvedValue(undefined);
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
      cooccurrenceService: {
        triggerComputation: triggerCooccurrenceComputationMock,
        getStatus: getCooccurrenceStatusMock,
        queryEdges: queryCooccurrenceEdgesMock,
        getEdgeBetween: getCooccurrenceEdgeBetweenMock,
        getPersistedPhotoCooccurrence: getPersistedPhotoCooccurrenceMock,
        syncScheduleFromPreferences: syncCooccurrenceScheduleFromPreferencesMock
      } as unknown as AppServices["cooccurrenceService"],
      immichClientFactory: {
        getClient: getClientMock
      } as unknown as AppServices["immichClientFactory"],
      relationshipService: {
        upsertRelationship: upsertRelationshipMock,
        updateSpouseRelationshipDates: updateSpouseRelationshipDatesMock,
        deleteRelationship: deleteRelationshipMock,
        upsertProfile: upsertProfileMock,
        findTargetsByRelationship: findTargetsByRelationshipMock,
        traverseRelationshipChain: traverseRelationshipChainMock,
        getProfilesForPersonIds: getProfilesForPersonIdsMock,
        getConnectedPersonIds: getConnectedPersonIdsMock,
        listRelationships: listRelationshipsMock,
        getPhotoCooccurrence: getPhotoCooccurrenceMock
      } as unknown as AppServices["relationshipService"],
      lifeEventService: lifeEventServiceMock as unknown as AppServices["lifeEventService"]
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
    expect(upsertRelationshipMock).toHaveBeenCalledWith("user-1", "p1", "p2", "CHILD_OF", undefined);
  });

  it("creates friend relationship edge", async () => {
    upsertRelationshipMock.mockResolvedValueOnce({
      direct: { id: "r-friend-1" },
      inverse: { id: "r-friend-2" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/people/p1/relationships",
      payload: {
        toPersonId: "p2",
        relationshipType: "FRIEND_OF"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(upsertRelationshipMock).toHaveBeenCalledWith("user-1", "p1", "p2", "FRIEND_OF", undefined);
  });

  it("creates spouse relationship edge with optional dates", async () => {
    upsertRelationshipMock.mockResolvedValueOnce({
      direct: { id: "r-spouse-1" },
      inverse: { id: "r-spouse-2" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/people/p1/relationships",
      payload: {
        toPersonId: "p2",
        relationshipType: "SPOUSE_OF",
        marriageAnniversaryDate: "2005-06-15",
        divorceDate: null
      }
    });

    expect(response.statusCode).toBe(201);
    expect(upsertRelationshipMock).toHaveBeenCalledWith("user-1", "p1", "p2", "SPOUSE_OF", {
      marriageAnniversaryDate: "2005-06-15",
      divorceDate: null
    });
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

  it("deletes pet relationship edge", async () => {
    deleteRelationshipMock.mockResolvedValueOnce({ count: 2 });

    const response = await app.inject({
      method: "DELETE",
      url: "/people/p1/relationships?toPersonId=p3&type=PET_OF"
    });

    expect(response.statusCode).toBe(200);
    expect(deleteRelationshipMock).toHaveBeenCalledWith("user-1", "p1", "p3", "PET_OF");
    expect(response.json().deletedCount).toBe(2);
  });

  it("updates spouse relationship dates", async () => {
    updateSpouseRelationshipDatesMock.mockResolvedValueOnce({ count: 2 });

    const response = await app.inject({
      method: "PATCH",
      url: "/people/p1/relationships",
      payload: {
        toPersonId: "p2",
        marriageAnniversaryDate: "2006-01-20"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updateSpouseRelationshipDatesMock).toHaveBeenCalledWith("user-1", "p1", "p2", {
      marriageAnniversaryDate: "2006-01-20",
      divorceDate: undefined
    });
    expect(lifeEventServiceMock.syncLegacySpouseDates).toHaveBeenCalledWith("user-1", "p1", "p2", {
      marriageAnniversaryDate: "2006-01-20",
      divorceDate: undefined
    });
    expect(response.json()).toEqual({ updatedCount: 2 });
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
      id: "pp1",
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

  it("updates extended person profile fields", async () => {
    upsertProfileMock.mockResolvedValueOnce({
      id: "pp1",
      immichPersonId: "p1",
      gender: "FEMALE",
      birthDateOverride: "1985-02-03",
      givenName: "Alex",
      surname: "Johnson",
      nicknames: "AJ",
      deathDate: null,
      birthCity: "Boston",
      birthCountry: "USA"
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/people/p1",
      payload: {
        givenName: "Alex",
        surname: "Johnson",
        nicknames: "AJ",
        deathDate: "",
        birthCity: "Boston",
        birthCountry: "USA"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(upsertProfileMock).toHaveBeenCalledWith("user-1", "p1", {
      givenName: "Alex",
      surname: "Johnson",
      nicknames: "AJ",
      deathDate: null,
      birthCity: "Boston",
      birthCountry: "USA"
    });
    expect(lifeEventServiceMock.syncLegacyPersonProfileFields).toHaveBeenCalledWith("user-1", "pp1", {
      deathDate: null,
      birthCity: "Boston",
      birthCountry: "USA"
    });
  });

  it("lists saved relationships", async () => {
    listRelationshipsMock.mockResolvedValueOnce({
      relationships: [
        {
          id: "rel-1",
          fromPersonId: "p1",
          toPersonId: "p2",
          type: "SPOUSE_OF",
          marriageAnniversaryDate: "2005-06-15",
          divorceDate: null
        }
      ],
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
    expect(json.relationships[0].type).toBe("SPOUSE_OF");
    expect(json.relationships[0].marriageAnniversaryDate).toBe("2005-06-15");
    expect(json.relationships[0].divorceDate).toBeNull();
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
    it("searches mother with inherent gender filter", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["jane-id", "john-id"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(
        new Map([
          ["jane-id", { gender: "FEMALE" }],
          ["john-id", { gender: "MALE" }]
        ])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "jessica-id", name: "Jessica" },
        { id: "jane-id", name: "Jane" },
        { id: "john-id", name: "John" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=mother%20of%20Jessica"
      });

      expect(response.statusCode).toBe(200);
      expect(traverseRelationshipChainMock).toHaveBeenCalledWith("user-1", ["jessica-id"], ["PARENT_OF"]);
      const json = response.json();
      expect(json.matches).toHaveLength(1);
      expect(json.matches[0].person.name).toBe("Jane");
    });

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

    it("searches mother-in-law via spouse -> parent traversal", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["mother-in-law-id", "father-in-law-id"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(
        new Map([
          ["mother-in-law-id", { gender: "FEMALE" }],
          ["father-in-law-id", { gender: "MALE" }]
        ])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "mother-in-law-id", name: "Martha" },
        { id: "father-in-law-id", name: "Frank" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=mother-in-law%20of%20Mike"
      });

      expect(response.statusCode).toBe(200);
      expect(traverseRelationshipChainMock).toHaveBeenCalledWith(
        "user-1",
        ["mike-id"],
        ["SPOUSE_OF", "PARENT_OF"]
      );
      const json = response.json();
      expect(json.matches).toHaveLength(1);
      expect(json.matches[0].person.name).toBe("Martha");
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

  describe("user preferences", () => {
    it("returns empty object when user has no saved preferences", async () => {
      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({ preferences: {} });

      const response = await app.inject({
        method: "GET",
        url: "/user/preferences"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences
      });
    });

    it("returns saved preferences", async () => {
      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({
        preferences: {
          familyViewStyle: "centeredRelationshipMap",
          graphFilterVisibility: {
            parentChild: true,
            spouse: true,
            sibling: false,
            friends: true,
            pets: false
          }
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/user/preferences"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        familyViewStyle: "centeredRelationshipMap",
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        graphFilterVisibility: {
          parentChild: true,
          spouse: true,
          sibling: false,
          friends: true,
          pets: false
        },
        cooccurrence: defaultCooccurrencePreferences
      });
    });

    it("returns empty object when stored preferences are corrupted", async () => {
      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({
        preferences: { familyViewStyle: "nonExistentStyle", extra: 123 }
      });

      const response = await app.inject({
        method: "GET",
        url: "/user/preferences"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences
      });
    });

    it("saves new preferences via PATCH", async () => {
      const savedPrefs = {
        familyViewStyle: "hybridTreeList",
        graphFilterVisibility: {
          parentChild: true,
          spouse: false,
          sibling: true,
          friends: true,
          pets: true
        }
      };
      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({ preferences: {} });
      treemichUserUpdateMock.mockResolvedValueOnce({ preferences: savedPrefs });

      const response = await app.inject({
        method: "PATCH",
        url: "/user/preferences",
        payload: savedPrefs
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ...savedPrefs,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences
      });
      expect(treemichUserUpdateMock).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { preferences: savedPrefs },
        select: { preferences: true }
      });
    });

    it("merges partial preferences with existing ones", async () => {
      const existing = {
        familyViewStyle: "generationTree",
        graphFilterVisibility: {
          parentChild: true,
          spouse: true,
          sibling: true,
          friends: true,
          pets: true
        }
      };
      const merged = {
        ...existing,
        familyViewStyle: "cleaned3D"
      };
      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({ preferences: existing });
      treemichUserUpdateMock.mockResolvedValueOnce({ preferences: merged });

      const response = await app.inject({
        method: "PATCH",
        url: "/user/preferences",
        payload: { familyViewStyle: "cleaned3D" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ...merged,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences
      });
      expect(treemichUserUpdateMock).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { preferences: merged },
        select: { preferences: true }
      });
    });

    it("preserves existing graphFilterVisibility when only familyViewStyle is sent", async () => {
      const existingFilters = {
        parentChild: false,
        spouse: true,
        sibling: false,
        friends: true,
        pets: false
      };
      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({
        preferences: { familyViewStyle: "generationTree", graphFilterVisibility: existingFilters }
      });
      treemichUserUpdateMock.mockResolvedValueOnce({
        preferences: { familyViewStyle: "hybridTreeList", graphFilterVisibility: existingFilters }
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/user/preferences",
        payload: { familyViewStyle: "hybridTreeList" }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.graphFilterVisibility).toEqual(existingFilters);
      expect(json.familyViewStyle).toBe("hybridTreeList");
      expect(json.showSingleFamilyTree).toBe(defaultShowSingleFamilyTree);
    });

    it("persists dismissed suggestion keys alongside existing preferences", async () => {
      const existing = {
        familyViewStyle: "generationTree",
        graphFilterVisibility: {
          parentChild: true,
          spouse: true,
          sibling: true,
          friends: false,
          pets: false
        }
      };
      const merged = {
        ...existing,
        dismissedSuggestions: ["parent:casey:alex", "sibling:alex:blair"]
      };
      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({ preferences: existing });
      treemichUserUpdateMock.mockResolvedValueOnce({ preferences: merged });

      const response = await app.inject({
        method: "PATCH",
        url: "/user/preferences",
        payload: { dismissedSuggestions: ["parent:casey:alex", "sibling:alex:blair"] }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ...merged,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences
      });
      expect(treemichUserUpdateMock).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { preferences: merged },
        select: { preferences: true }
      });
    });

    it("persists and clears lastSelectedPersonId", async () => {
      const existing = {
        familyViewStyle: "generationTree",
        graphFilterVisibility: {
          parentChild: true,
          spouse: true,
          sibling: true,
          friends: true,
          pets: true
        }
      };
      const merged = {
        ...existing,
        lastSelectedPersonId: "p-42"
      };
      const cleared = {
        ...existing,
        lastSelectedPersonId: null
      };

      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({ preferences: existing });
      treemichUserUpdateMock.mockResolvedValueOnce({ preferences: merged });

      const setResponse = await app.inject({
        method: "PATCH",
        url: "/user/preferences",
        payload: { lastSelectedPersonId: "p-42" }
      });

      expect(setResponse.statusCode).toBe(200);
      expect(setResponse.json()).toEqual({
        ...merged,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences
      });
      expect(treemichUserUpdateMock).toHaveBeenNthCalledWith(1, {
        where: { id: "user-1" },
        data: { preferences: merged },
        select: { preferences: true }
      });

      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({ preferences: merged });
      treemichUserUpdateMock.mockResolvedValueOnce({ preferences: cleared });

      const clearResponse = await app.inject({
        method: "PATCH",
        url: "/user/preferences",
        payload: { lastSelectedPersonId: null }
      });

      expect(clearResponse.statusCode).toBe(200);
      expect(clearResponse.json()).toEqual({
        ...cleared,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences
      });
      expect(treemichUserUpdateMock).toHaveBeenNthCalledWith(2, {
        where: { id: "user-1" },
        data: { preferences: cleared },
        select: { preferences: true }
      });
    });

    it("rejects invalid familyViewStyle values", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/user/preferences",
        payload: { familyViewStyle: "invalidView" }
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects invalid graphFilterVisibility field types", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/user/preferences",
        payload: {
          graphFilterVisibility: {
            parentChild: "yes",
            spouse: true,
            sibling: true,
            friends: true,
            pets: true
          }
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("graph layout route", () => {
    it("returns deterministic layout positions and revision", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/graph/layout",
        payload: {
          people: [
            { id: "p1", name: "Alex" },
            { id: "p2", name: "Blair" },
            { id: "p3", name: "Casey" }
          ],
          relationships: [
            { fromPersonId: "p1", toPersonId: "p2", type: "SPOUSE_OF" },
            { fromPersonId: "p1", toPersonId: "p3", type: "PARENT_OF" }
          ],
          viewMode: "family",
          familyViewStyle: "generationTree",
          selectedPersonId: "p1"
        }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        layoutRevision: string;
        algorithmVersion: string;
        positionsByPersonId: Record<string, [number, number, number]>;
      };
      expect(body.algorithmVersion).toBe("server-hybrid-v1");
      expect(body.layoutRevision.length).toBeGreaterThan(1);
      expect(Object.keys(body.positionsByPersonId).sort()).toEqual(["p1", "p2", "p3"]);
      expect(body.positionsByPersonId.p1).toBeDefined();
      expect(body.positionsByPersonId.p2).toBeDefined();
      expect(body.positionsByPersonId.p3).toBeDefined();
    });

    it("returns same revision and positions for same topology", async () => {
      const payload = {
        people: [
          { id: "p1", name: "Alex" },
          { id: "p2", name: "Blair" }
        ],
        relationships: [{ fromPersonId: "p1", toPersonId: "p2", type: "SIBLING_OF" }],
        viewMode: "family"
      };

      const first = await app.inject({
        method: "POST",
        url: "/graph/layout",
        payload
      });
      const second = await app.inject({
        method: "POST",
        url: "/graph/layout",
        payload
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      const firstBody = first.json() as {
        layoutRevision: string;
        positionsByPersonId: Record<string, [number, number, number]>;
      };
      const secondBody = second.json() as {
        layoutRevision: string;
        positionsByPersonId: Record<string, [number, number, number]>;
      };
      expect(firstBody.layoutRevision).toBe(secondBody.layoutRevision);
      expect(secondBody.positionsByPersonId).toEqual(firstBody.positionsByPersonId);
    });
  });

  it("lists life events for a person", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/people/p1/life-events"
    });

    expect(response.statusCode).toBe(200);
    expect(lifeEventServiceMock.listPersonLifeEvents).toHaveBeenCalledWith("user-1", "p1", {
      includeCitations: false
    });
    expect(response.json()).toEqual({ lifeEvents: [] });
  });

  it("returns 409 when creating duplicate birth event", async () => {
    lifeEventServiceMock.createPersonLifeEvent.mockRejectedValueOnce(
      new HttpConflictError("A BIRTH event already exists for this person")
    );

    const response = await app.inject({
      method: "POST",
      url: "/people/p1/life-events",
      payload: {
        eventType: "BIRTH",
        year: 1990,
        month: 1,
        day: 1
      }
    });

    expect(response.statusCode).toBe(409);
  });

  it("returns 400 when life event payload fails semantic date validation", async () => {
    lifeEventServiceMock.createPersonLifeEvent.mockRejectedValueOnce(
      new HttpValidationError("month is required when day is set")
    );

    const response = await app.inject({
      method: "POST",
      url: "/people/p1/life-events",
      payload: {
        eventType: "CUSTOM",
        day: 15
      }
    });

    expect(response.statusCode).toBe(400);
  });
});
