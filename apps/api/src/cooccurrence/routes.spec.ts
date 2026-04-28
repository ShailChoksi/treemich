import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../services.js";

const triggerComputationMock = vi.fn();
const getStatusMock = vi.fn();
const queryEdgesMock = vi.fn();
const getEdgeBetweenMock = vi.fn();
const getPersistedPhotoCooccurrenceMock = vi.fn();
const syncScheduleFromPreferencesMock = vi.fn();
const getPhotoCooccurrenceMock = vi.fn();
const loginWithImmichMock = vi.fn();
const getAuthStateMock = vi.fn();
const requireSessionMock = vi.fn();
const logoutMock = vi.fn();
const cleanupExpiredSessionsMock = vi.fn();
const getClientMock = vi.fn();
const queryRawMock = vi.fn();
const treemichUserFindUniqueOrThrowMock = vi.fn();
const treemichUserUpdateMock = vi.fn();

vi.mock("../db/client.js", () => ({
  prisma: {
    $queryRaw: queryRawMock,
    treemichUser: {
      findUniqueOrThrow: treemichUserFindUniqueOrThrowMock,
      update: treemichUserUpdateMock
    }
  }
}));

describe("cooccurrence routes", () => {
  let app: FastifyInstance;

  const authContext = {
    user: {
      id: "user-1",
      immichBaseUrl: "http://localhost:2283/api",
      immichUserId: "immich-user-1",
      immichEmail: "mike@example.com",
      immichName: "Mike",
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

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:54321/treemich_test";
    process.env.IMMICH_BASE_URL = "http://localhost:2283/api";
    process.env.TREEMICH_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.TREEMICH_SESSION_COOKIE_NAME = "treemich_session";
    queryRawMock.mockResolvedValue([1]);
    requireSessionMock.mockResolvedValue(authContext);
    getClientMock.mockReturnValue({
      listAssetsWithPeople: vi.fn(),
      listPeople: vi.fn(),
      getPersonThumbnail: vi.fn()
    });
    cleanupExpiredSessionsMock.mockResolvedValue(0);
    getAuthStateMock.mockResolvedValue({
      authenticated: true,
      user: {
        id: "user-1",
        immichUserId: "immich-user-1",
        email: "mike@example.com",
        name: "Mike"
      },
      linkStatus: {
        linked: true
      }
    });
  });

  beforeEach(async () => {
    const services: AppServices = {
      authService: {
        loginWithImmich: loginWithImmichMock,
        getAuthState: getAuthStateMock,
        requireSession: requireSessionMock,
        logout: logoutMock,
        cleanupExpiredSessions: cleanupExpiredSessionsMock
      } as unknown as AppServices["authService"],
      cooccurrenceService: {
        triggerComputation: triggerComputationMock,
        getStatus: getStatusMock,
        queryEdges: queryEdgesMock,
        getEdgeBetween: getEdgeBetweenMock,
        getPersistedPhotoCooccurrence: getPersistedPhotoCooccurrenceMock,
        syncScheduleFromPreferences: syncScheduleFromPreferencesMock
      } as unknown as AppServices["cooccurrenceService"],
      immichClientFactory: {
        getClient: getClientMock
      } as unknown as AppServices["immichClientFactory"],
      personService: {} as unknown as AppServices["personService"],
      relationshipService: {
        getPhotoCooccurrence: getPhotoCooccurrenceMock,
        getProfilesForPersonIds: vi.fn().mockResolvedValue(new Map()),
        getConnectedPersonIds: vi.fn().mockResolvedValue(new Set()),
        listRelationships: vi.fn().mockResolvedValue({ relationships: [], nextCursor: null }),
        upsertRelationship: vi.fn(),
        deleteRelationship: vi.fn(),
        upsertProfile: vi.fn(),
        hasSpouseRelationship: vi.fn(),
        findTargetsByRelationship: vi.fn(),
        traverseRelationshipChain: vi.fn()
      } as unknown as AppServices["relationshipService"],
      lifeEventService: {
        getSpouseMarriageDivorceIsoForPairs: vi.fn().mockResolvedValue(new Map()),
        getBirthDeathByPersonProfileIds: vi.fn().mockResolvedValue(new Map()),
        syncPersonProfileFieldsToLifeEvents: vi.fn(),
        syncSpouseDatesToLifeEvents: vi.fn(),
        listPersonLifeEvents: vi.fn().mockResolvedValue([]),
        createPersonLifeEvent: vi.fn(),
        updatePersonLifeEvent: vi.fn(),
        deletePersonLifeEvent: vi.fn(),
        validatePersonLifeEvents: vi.fn().mockResolvedValue({ findings: [] }),
        listRelationshipLifeEvents: vi.fn(),
        createRelationshipLifeEvent: vi.fn(),
        updateRelationshipLifeEvent: vi.fn(),
        deleteRelationshipLifeEvent: vi.fn(),
        listFamilyLifeEvents: vi.fn().mockResolvedValue([]),
        createFamilyLifeEvent: vi.fn(),
        updateFamilyLifeEvent: vi.fn(),
        deleteFamilyLifeEvent: vi.fn()
      } as unknown as AppServices["lifeEventService"],
      personNameService: {
        listByImmichPersonId: vi.fn().mockResolvedValue([]),
        getPrimaryMapForProfileIds: vi.fn().mockResolvedValue(new Map()),
        getAllFormattedForUser: vi.fn().mockResolvedValue(new Map()),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        setPrimary: vi.fn()
      } as unknown as AppServices["personNameService"],
      researchTaskService: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      } as unknown as AppServices["researchTaskService"],
      evidenceService: {
        listRepositories: vi.fn().mockResolvedValue([]),
        createRepository: vi.fn(),
        updateRepository: vi.fn(),
        deleteRepository: vi.fn(),
        listSources: vi.fn().mockResolvedValue([]),
        createSource: vi.fn(),
        updateSource: vi.fn(),
        deleteSource: vi.fn(),
        mergeSources: vi.fn(),
        listMediaObjects: vi.fn().mockResolvedValue([]),
        createMediaObject: vi.fn(),
        updateMediaObject: vi.fn(),
        deleteMediaObject: vi.fn(),
        listMediaLinksForObject: vi.fn().mockResolvedValue([]),
        createMediaLink: vi.fn(),
        deleteMediaLink: vi.fn()
      } as unknown as AppServices["evidenceService"],
      familyService: {
        listFamilies: vi.fn().mockResolvedValue([]),
        getFamily: vi.fn(),
        listFamiliesForPerson: vi.fn().mockResolvedValue([]),
        createFamily: vi.fn(),
        patchFamily: vi.fn(),
        deleteFamily: vi.fn(),
        findAdoptedChildPersonIds: vi.fn().mockResolvedValue([])
      } as unknown as AppServices["familyService"]
    };

    const { buildApp } = await import("../app.js");
    app = buildApp({ services });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("triggers a background cooccurrence job", async () => {
    triggerComputationMock.mockResolvedValue({
      id: "job-1",
      status: "PENDING"
    });

    const response = await app.inject({
      method: "POST",
      url: "/people/cooccurrence/compute"
    });

    expect(response.statusCode).toBe(202);
    expect(triggerComputationMock).toHaveBeenCalledWith("user-1", expect.any(Object));
    expect(response.json()).toEqual({
      jobId: "job-1",
      status: "PENDING"
    });
  });

  it("returns cooccurrence status and schedule info", async () => {
    getStatusMock.mockResolvedValue({
      job: {
        id: "job-1",
        status: "COMPLETED",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      schedule: {
        refreshEnabled: true,
        refreshIntervalDays: 7,
        nextRunAt: "2026-01-08T00:00:00.000Z",
        lastRunAt: "2026-01-01T00:00:00.000Z"
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/people/cooccurrence/status"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().schedule.refreshIntervalDays).toBe(7);
  });

  it("queries persisted cooccurrence edges with filters", async () => {
    queryEdgesMock.mockResolvedValue({
      edges: [],
      nextCursor: null
    });

    const response = await app.inject({
      method: "GET",
      url: "/people/cooccurrence/edges?personId=p1&minSharedPhotos=3&minScore=0.5&limit=25"
    });

    expect(response.statusCode).toBe(200);
    expect(queryEdgesMock).toHaveBeenCalledWith("user-1", {
      cursor: undefined,
      limit: 25,
      minSharedPhotos: 3,
      minScore: 0.5,
      personId: "p1"
    });
  });

  it("returns a single persisted edge by pair", async () => {
    getEdgeBetweenMock.mockResolvedValue({
      id: "edge-1",
      personAId: "p1",
      personBId: "p2",
      sharedPhotos: 4,
      score: 0.8,
      personAPhotoCount: 5,
      personBPhotoCount: 5,
      computedAt: "2026-01-01T00:00:00.000Z"
    });

    const response = await app.inject({
      method: "GET",
      url: "/people/cooccurrence/pair?personA=p2&personB=p1"
    });

    expect(response.statusCode).toBe(200);
    expect(getEdgeBetweenMock).toHaveBeenCalledWith("user-1", "p2", "p1");
  });

  it("prefers persisted cooccurrence data when available", async () => {
    getPersistedPhotoCooccurrenceMock.mockResolvedValue({
      clusters: [{ id: "cluster-p1", personIds: ["p1", "p2"], size: 2 }],
      edges: [{ personAId: "p1", personBId: "p2", sharedPhotos: 3, score: 1 }],
      computedAt: "2026-01-01T00:00:00.000Z",
      sourcePhotoCount: 5
    });

    const response = await app.inject({
      method: "GET",
      url: "/people/cooccurrence?minSharedPhotos=2&minScore=0"
    });

    expect(response.statusCode).toBe(200);
    expect(getPersistedPhotoCooccurrenceMock).toHaveBeenCalledWith("user-1", {
      minSharedPhotos: 2,
      minScore: 0
    });
    expect(getPhotoCooccurrenceMock).toHaveBeenCalledTimes(0);
  });

  it("falls back to the live cooccurrence computation when nothing is persisted yet", async () => {
    getPersistedPhotoCooccurrenceMock.mockResolvedValue(null);
    getPhotoCooccurrenceMock.mockResolvedValue({
      clusters: [],
      edges: [],
      computedAt: "2026-01-01T00:00:00.000Z",
      sourcePhotoCount: 0
    });

    const response = await app.inject({
      method: "GET",
      url: "/people/cooccurrence"
    });

    expect(response.statusCode).toBe(200);
    expect(getPhotoCooccurrenceMock).toHaveBeenCalledWith(
      "user-1",
      expect.any(Object),
      expect.objectContaining({
        minSharedPhotos: 2,
        minScore: 0
      })
    );
  });

  it("syncs cooccurrence schedule settings when preferences are updated", async () => {
    treemichUserFindUniqueOrThrowMock.mockResolvedValue({
      preferences: {}
    });
    treemichUserUpdateMock.mockResolvedValue({
      preferences: {
        dismissedSuggestions: ["a"],
        cooccurrence: {
          refreshEnabled: false,
          refreshIntervalDays: 14
        }
      }
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/user/preferences",
      payload: {
        dismissedSuggestions: ["a"],
        cooccurrence: {
          refreshEnabled: false,
          refreshIntervalDays: 14
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(syncScheduleFromPreferencesMock).toHaveBeenCalledWith("user-1");
    expect(response.json().cooccurrence).toEqual({
      refreshEnabled: false,
      refreshIntervalDays: 14
    });
  });
});
