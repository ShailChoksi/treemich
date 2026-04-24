import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../services.js";

const listRepositoriesMock = vi.fn();
const createRepositoryMock = vi.fn();
const listSourcesMock = vi.fn();
const createSourceMock = vi.fn();
const deleteSourceMock = vi.fn();
const createMediaObjectMock = vi.fn();
const createMediaLinkMock = vi.fn();
const mergeSourcesMock = vi.fn();

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

describe("evidence routes", () => {
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
      linkStatus: { linked: true }
    });
    listRepositoriesMock.mockResolvedValue([]);
    listSourcesMock.mockResolvedValue([]);
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
        triggerComputation: vi.fn(),
        getStatus: vi.fn(),
        queryEdges: vi.fn(),
        getEdgeBetween: vi.fn(),
        getPersistedPhotoCooccurrence: vi.fn(),
        syncScheduleFromPreferences: vi.fn()
      } as unknown as AppServices["cooccurrenceService"],
      immichClientFactory: {
        getClient: getClientMock
      } as unknown as AppServices["immichClientFactory"],
      relationshipService: {
        getPhotoCooccurrence: vi.fn(),
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
        listRepositories: listRepositoriesMock,
        createRepository: createRepositoryMock,
        updateRepository: vi.fn(),
        deleteRepository: vi.fn(),
        listSources: listSourcesMock,
        createSource: createSourceMock,
        updateSource: vi.fn(),
        mergeSources: mergeSourcesMock,
        deleteSource: deleteSourceMock,
        listMediaObjects: vi.fn().mockResolvedValue([]),
        createMediaObject: createMediaObjectMock,
        updateMediaObject: vi.fn(),
        deleteMediaObject: vi.fn(),
        listMediaLinksForObject: vi.fn().mockResolvedValue([]),
        createMediaLink: createMediaLinkMock,
        deleteMediaLink: vi.fn()
      } as unknown as AppServices["evidenceService"],
      familyService: {
        listFamilies: vi.fn().mockResolvedValue([]),
        getFamily: vi.fn(),
        listFamiliesForPerson: vi.fn().mockResolvedValue([]),
        createFamily: vi.fn(),
        patchFamily: vi.fn(),
        deleteFamily: vi.fn(),
        findAdoptedChildImmichPersonIds: vi.fn().mockResolvedValue([])
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

  it("lists repositories for the session user", async () => {
    listRepositoriesMock.mockResolvedValueOnce([
      {
        id: "r1",
        name: "Archive",
        addressLine1: null,
        url: null,
        notes: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    const response = await app.inject({ method: "GET", url: "/evidence/repositories" });

    expect(response.statusCode).toBe(200);
    expect(listRepositoriesMock).toHaveBeenCalledWith("user-1");
    expect(response.json()).toEqual({
      repositories: [
        {
          id: "r1",
          name: "Archive",
          addressLine1: null,
          url: null,
          notes: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    });
  });

  it("creates a repository (201)", async () => {
    const row = {
      id: "r-new",
      name: "Library",
      addressLine1: null,
      url: null,
      notes: null,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z"
    };
    createRepositoryMock.mockResolvedValueOnce(row);

    const response = await app.inject({
      method: "POST",
      url: "/evidence/repositories",
      payload: { name: "Library", addressLine1: null, url: null, notes: null }
    });

    expect(response.statusCode).toBe(201);
    expect(createRepositoryMock).toHaveBeenCalledWith("user-1", {
      name: "Library",
      addressLine1: null,
      url: null,
      notes: null
    });
    expect(response.json()).toEqual(row);
  });

  it("lists sources with optional query", async () => {
    listSourcesMock.mockResolvedValueOnce([
      {
        id: "s1",
        repositoryId: null,
        title: "Census",
        author: null,
        publication: null,
        url: null,
        notes: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        repository: null
      }
    ]);

    const response = await app.inject({ method: "GET", url: "/evidence/sources?q=census" });

    expect(response.statusCode).toBe(200);
    expect(listSourcesMock).toHaveBeenCalledWith("user-1", "census");
    expect(response.json().sources).toHaveLength(1);
  });

  it("deletes a source (204)", async () => {
    deleteSourceMock.mockResolvedValueOnce(undefined);

    const response = await app.inject({ method: "DELETE", url: "/evidence/sources/s1" });

    expect(response.statusCode).toBe(204);
    expect(deleteSourceMock).toHaveBeenCalledWith("user-1", "s1");
  });

  it("merges sources (204)", async () => {
    mergeSourcesMock.mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: "POST",
      url: "/evidence/sources/merge",
      payload: { fromSourceId: "s-a", intoSourceId: "s-b" }
    });

    expect(response.statusCode).toBe(204);
    expect(mergeSourcesMock).toHaveBeenCalledWith("user-1", "s-a", "s-b");
  });

  it("rejects merge when from and into are the same (schema)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/evidence/sources/merge",
      payload: { fromSourceId: "s1", intoSourceId: "s1" }
    });

    expect(response.statusCode).toBe(400);
    expect(mergeSourcesMock).not.toHaveBeenCalled();
  });

  it("creates media and a link (201)", async () => {
    const media = {
      id: "m1",
      storageUrl: "https://x/doc.pdf",
      mimeType: "application/pdf",
      checksum: null,
      immichAssetId: null,
      title: "Will",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    createMediaObjectMock.mockResolvedValueOnce(media);
    const link = {
      id: "lnk1",
      mediaObjectId: "m1",
      targetType: "SOURCE" as const,
      targetId: "s9",
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    createMediaLinkMock.mockResolvedValueOnce(link);

    const mediaRes = await app.inject({
      method: "POST",
      url: "/evidence/media",
      payload: {
        storageUrl: "https://x/doc.pdf",
        mimeType: "application/pdf",
        checksum: null,
        immichAssetId: null,
        title: "Will"
      }
    });
    expect(mediaRes.statusCode).toBe(201);
    expect(createMediaObjectMock).toHaveBeenCalledWith("user-1", {
      storageUrl: "https://x/doc.pdf",
      mimeType: "application/pdf",
      checksum: null,
      immichAssetId: null,
      title: "Will"
    });

    const linkRes = await app.inject({
      method: "POST",
      url: "/evidence/media/m1/links",
      payload: { targetType: "SOURCE", targetId: "s9", notes: null }
    });
    expect(linkRes.statusCode).toBe(201);
    expect(createMediaLinkMock).toHaveBeenCalledWith("user-1", "m1", {
      targetType: "SOURCE",
      targetId: "s9",
      notes: null
    });
  });
});
