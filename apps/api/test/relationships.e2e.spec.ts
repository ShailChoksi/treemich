import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import AdmZip from "adm-zip";
import { HttpConflictError, HttpNotFoundError, HttpValidationError } from "../src/lifeEvents/errors.js";
import { EXPENSIVE_ROUTE_RATE_LIMIT } from "../src/routes/rate-limit.js";
import type { AppServices } from "../src/services.js";

const upsertRelationshipMock = vi.fn();
const hasSpouseRelationshipMock = vi.fn();
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
const listDuplicateCandidatesMock = vi.fn();
const recomputeDuplicateCandidatesMock = vi.fn();
const updateDuplicateCandidateMock = vi.fn();
const mergeDuplicateCandidateMock = vi.fn();
const getPersonThumbnailMock = vi.fn();
const listAssetsWithPeopleMock = vi.fn();
const loginWithImmichMock = vi.fn();
const getAuthStateMock = vi.fn();
const requireSessionMock = vi.fn();
const logoutMock = vi.fn();
const getClientMock = vi.fn();
const queryRawMock = vi.fn();
const treemichUserFindUniqueOrThrowMock = vi.fn();
const treemichUserFindUniqueMock = vi.fn();
const treemichUserUpdateMock = vi.fn();
const personProfileFindManyMock = vi.fn();
const personExternalIdentityFindManyMock = vi.fn();
const personThumbnailFindManyMock = vi.fn();
const relationshipFindManyForExportMock = vi.fn();
const placeFindManyMock = vi.fn();
const lifeEventFindManyForExportMock = vi.fn();
const treemichSessionFindManyMock = vi.fn();
const researchTaskFindManyMock = vi.fn();
const linkedImmichAccountFindUniqueMock = vi.fn();
const cooccurrenceJobFindManyMock = vi.fn();
const cooccurrenceEdgeFindManyMock = vi.fn();
const cooccurrenceScheduleFindUniqueMock = vi.fn();
const personNameFindManyMock = vi.fn();
const repositoryFindManyMock = vi.fn();
const sourceFindManyMock = vi.fn();
const mediaObjectFindManyMock = vi.fn();
const mediaLinkFindManyMock = vi.fn();
const familyFindManyMock = vi.fn();
const countForExportMock = vi.fn();
const findAdoptedChildPersonIdsMock = vi.fn();
const listPersonServiceMock = vi.fn().mockResolvedValue([]);
const updatePersonServiceMock = vi.fn().mockResolvedValue({ id: "pp1" });
const createPersonServiceMock = vi.fn();
const getPersonServiceMock = vi.fn();
const resolvePersonIdMock = vi.fn().mockImplementation((_userId: string, id: string) => Promise.resolve(id));
const listExternalIdentitiesMock = vi.fn().mockResolvedValue([]);
const addExternalIdentityMock = vi.fn();
const deleteExternalIdentityMock = vi.fn();
const deletePersonServiceMock = vi.fn();
const loginWithPasswordMock = vi.fn().mockResolvedValue({
  sessionToken: "session-token",
  state: { authenticated: false, linkStatus: { linked: false } }
});
const lifeEventServiceMock = {
  getSpouseMarriageDivorceIsoForPairs: vi.fn().mockResolvedValue(new Map()),
  getBirthDeathByPersonProfileIds: vi.fn().mockResolvedValue(new Map()),
  syncPersonProfileFieldsToLifeEvents: vi.fn().mockResolvedValue(undefined),
  syncSpouseDatesToLifeEvents: vi.fn().mockResolvedValue(undefined),
  listPersonLifeEvents: vi.fn().mockResolvedValue([]),
  createPersonLifeEvent: vi.fn(),
  updatePersonLifeEvent: vi.fn(),
  deletePersonLifeEvent: vi.fn(),
  validatePersonLifeEvents: vi.fn().mockResolvedValue({ findings: [] }),
  listRelationshipLifeEvents: vi.fn().mockResolvedValue([]),
  createRelationshipLifeEvent: vi.fn(),
  updateRelationshipLifeEvent: vi.fn(),
  deleteRelationshipLifeEvent: vi.fn(),
  listFamilyLifeEvents: vi.fn().mockResolvedValue([]),
  createFamilyLifeEvent: vi.fn(),
  updateFamilyLifeEvent: vi.fn(),
  deleteFamilyLifeEvent: vi.fn()
};

const personNameServiceMock = {
  listByPersonId: vi.fn().mockResolvedValue([]),
  getPrimaryMapForProfileIds: vi.fn().mockResolvedValue(new Map()),
  getAllFormattedForUser: vi.fn().mockResolvedValue(new Map()),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  setPrimary: vi.fn()
};
const researchTaskServiceMock = {
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn()
};
const evidenceServiceMock = {
  listRepositories: vi.fn().mockResolvedValue([]),
  createRepository: vi.fn(),
  updateRepository: vi.fn(),
  deleteRepository: vi.fn(),
  listSources: vi.fn().mockResolvedValue([]),
  createSource: vi.fn(),
  updateSource: vi.fn(),
  mergeSources: vi.fn(),
  deleteSource: vi.fn(),
  listMediaObjects: vi.fn().mockResolvedValue([]),
  createMediaObject: vi.fn(),
  updateMediaObject: vi.fn(),
  deleteMediaObject: vi.fn(),
  listMediaLinksForObject: vi.fn().mockResolvedValue([]),
  createMediaLink: vi.fn(),
  deleteMediaLink: vi.fn()
};

vi.mock("../src/db/client.js", () => ({
  prisma: {
    $queryRaw: queryRawMock,
    treemichUser: {
      findUniqueOrThrow: treemichUserFindUniqueOrThrowMock,
      findUnique: treemichUserFindUniqueMock,
      update: treemichUserUpdateMock
    },
    personProfile: { findMany: personProfileFindManyMock, count: countForExportMock },
    personExternalIdentity: { findMany: personExternalIdentityFindManyMock, count: countForExportMock },
    personThumbnail: { findMany: personThumbnailFindManyMock, count: countForExportMock },
    relationship: { findMany: relationshipFindManyForExportMock, count: countForExportMock },
    place: { findMany: placeFindManyMock, count: countForExportMock },
    lifeEvent: { findMany: lifeEventFindManyForExportMock, count: countForExportMock },
    personName: { findMany: personNameFindManyMock, count: countForExportMock },
    family: { findMany: familyFindManyMock, count: countForExportMock },
    researchTask: { findMany: researchTaskFindManyMock, count: countForExportMock },
    repository: { findMany: repositoryFindManyMock, count: countForExportMock },
    source: { findMany: sourceFindManyMock, count: countForExportMock },
    mediaObject: { findMany: mediaObjectFindManyMock, count: countForExportMock },
    mediaLink: { findMany: mediaLinkFindManyMock, count: countForExportMock },
    treemichSession: { findMany: treemichSessionFindManyMock, count: countForExportMock },
    linkedImmichAccount: { findUnique: linkedImmichAccountFindUniqueMock },
    cooccurrenceJob: { findMany: cooccurrenceJobFindManyMock, count: countForExportMock },
    cooccurrenceEdge: { findMany: cooccurrenceEdgeFindManyMock, count: countForExportMock },
    cooccurrenceSchedule: { findUnique: cooccurrenceScheduleFindUniqueMock }
  }
}));

describe("Treemich API routes", () => {
  let app: FastifyInstance;
  let buildApp: (typeof import("../src/app.js"))["buildApp"];
  const defaultCooccurrencePreferences = {
    refreshEnabled: true,
    refreshIntervalDays: 7
  };
  const defaultGraphRenderLimit = 120;
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

  const makeSearchPersonRow = (person: {
    id: string;
    name: string;
    gender?: string;
    externalDisplayName?: string | null;
    alternateNames?: Array<{
      givenName?: string | null;
      surname?: string | null;
      prefix?: string | null;
      suffix?: string | null;
    }>;
  }) => {
    const [givenName, ...surnameParts] = person.name.split(/\s+/);
    return {
      id: person.id,
      userId: "user-1",
      gender: person.gender ?? "UNKNOWN",
      displayNameOverride: null,
      givenName: givenName ?? person.name,
      surname: surnameParts.join(" ") || null,
      nicknames: null,
      externalIds: {},
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      externalIdentities: person.externalDisplayName
        ? [
            {
              id: `identity-${person.id}`,
              userId: "user-1",
              personId: person.id,
              provider: "IMMICH",
              providerPersonId: `immich-${person.id}`,
              providerBaseUrl: "http://localhost:2283/api",
              displayName: person.externalDisplayName,
              thumbnailImportedAt: null,
              lastSeenAt: null,
              metadata: {},
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-01T00:00:00.000Z")
            }
          ]
        : [],
      personNames: person.alternateNames ?? [],
      thumbnails: []
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    lifeEventServiceMock.getBirthDeathByPersonProfileIds.mockResolvedValue(new Map());
    lifeEventServiceMock.syncPersonProfileFieldsToLifeEvents.mockResolvedValue(undefined);
    lifeEventServiceMock.syncSpouseDatesToLifeEvents.mockResolvedValue(undefined);
    lifeEventServiceMock.getSpouseMarriageDivorceIsoForPairs.mockResolvedValue(new Map());
    lifeEventServiceMock.listPersonLifeEvents.mockResolvedValue([]);
    lifeEventServiceMock.validatePersonLifeEvents.mockResolvedValue({ findings: [] });
    lifeEventServiceMock.listRelationshipLifeEvents.mockResolvedValue([]);
    lifeEventServiceMock.listFamilyLifeEvents.mockResolvedValue([]);
    personNameServiceMock.listByPersonId.mockResolvedValue([]);
    personNameServiceMock.getPrimaryMapForProfileIds.mockResolvedValue(new Map());
    personNameServiceMock.getAllFormattedForUser.mockResolvedValue(new Map());
    researchTaskServiceMock.list.mockResolvedValue([]);
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:54321/treemich_test";
    process.env.IMMICH_BASE_URL = "http://localhost:2283/api";
    process.env.TREEMICH_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.TREEMICH_SESSION_COOKIE_NAME = "treemich_session";
    queryRawMock.mockResolvedValue([1]);
    countForExportMock.mockResolvedValue(0);
    treemichUserFindUniqueMock.mockResolvedValue(null);
    personProfileFindManyMock.mockImplementation(async (args?: { include?: Record<string, unknown> }) => {
      if (args?.include && "externalIdentities" in args.include && "personNames" in args.include) {
        const people = (await listPeopleMock()) as
          | Array<{ id: string; name: string; gender?: string }>
          | undefined;
        return (people ?? []).map(makeSearchPersonRow);
      }
      return [];
    });
    relationshipFindManyForExportMock.mockResolvedValue([]);
    personExternalIdentityFindManyMock.mockResolvedValue([]);
    personThumbnailFindManyMock.mockResolvedValue([]);
    placeFindManyMock.mockResolvedValue([]);
    lifeEventFindManyForExportMock.mockResolvedValue([]);
    treemichSessionFindManyMock.mockResolvedValue([]);
    researchTaskFindManyMock.mockResolvedValue([]);
    repositoryFindManyMock.mockResolvedValue([]);
    sourceFindManyMock.mockResolvedValue([]);
    mediaObjectFindManyMock.mockResolvedValue([]);
    mediaLinkFindManyMock.mockResolvedValue([]);
    linkedImmichAccountFindUniqueMock.mockResolvedValue(null);
    cooccurrenceJobFindManyMock.mockResolvedValue([]);
    cooccurrenceEdgeFindManyMock.mockResolvedValue([]);
    cooccurrenceScheduleFindUniqueMock.mockResolvedValue(null);
    personNameFindManyMock.mockResolvedValue([]);
    familyFindManyMock.mockResolvedValue([]);
    treemichUserFindUniqueOrThrowMock.mockResolvedValue({ preferences: null });
    getClientMock.mockReturnValue(immichClient);
    requireSessionMock.mockResolvedValue(authContext);
    syncCooccurrenceScheduleFromPreferencesMock.mockResolvedValue(undefined);
    getAuthStateMock.mockResolvedValue({
      authenticated: false,
      linkStatus: {
        linked: false
      }
    });
    listPersonServiceMock.mockResolvedValue([]);
    listDuplicateCandidatesMock.mockResolvedValue([]);
    recomputeDuplicateCandidatesMock.mockResolvedValue({
      candidates: [],
      summary: { created: 0, updated: 0, preservedDismissed: 0, pending: 0 }
    });
    updateDuplicateCandidateMock.mockResolvedValue({ id: "dup-1", status: "DISMISSED" });
    mergeDuplicateCandidateMock.mockResolvedValue({
      auditId: "audit-1",
      canonicalPersonId: "p1",
      duplicatePersonId: "p2"
    });
    resolvePersonIdMock.mockImplementation((_userId: string, id: string) => Promise.resolve(id));
    listExternalIdentitiesMock.mockResolvedValue([]);
    deletePersonServiceMock.mockResolvedValue(undefined);
    loginWithPasswordMock.mockResolvedValue({
      sessionToken: "session-token",
      state: { authenticated: false, linkStatus: { linked: false } }
    });
  });

  beforeAll(async () => {
    ({ buildApp } = await import("../src/app.js"));
  });

  beforeEach(async () => {
    const services: AppServices = {
      authService: {
        loginWithPassword: loginWithPasswordMock,
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
        hasSpouseRelationship: hasSpouseRelationshipMock,
        deleteRelationship: deleteRelationshipMock,
        upsertProfile: upsertProfileMock,
        findTargetsByRelationship: findTargetsByRelationshipMock,
        traverseRelationshipChain: traverseRelationshipChainMock,
        getProfilesForPersonIds: getProfilesForPersonIdsMock,
        getConnectedPersonIds: getConnectedPersonIdsMock,
        listRelationships: listRelationshipsMock,
        getPhotoCooccurrence: getPhotoCooccurrenceMock
      } as unknown as AppServices["relationshipService"],
      personService: {
        list: listPersonServiceMock,
        create: createPersonServiceMock,
        get: getPersonServiceMock,
        update: updatePersonServiceMock,
        resolvePersonId: resolvePersonIdMock,
        listExternalIdentities: listExternalIdentitiesMock,
        addExternalIdentity: addExternalIdentityMock,
        deleteExternalIdentity: deleteExternalIdentityMock,
        delete: deletePersonServiceMock
      } as unknown as AppServices["personService"],
      personDuplicateService: {
        list: listDuplicateCandidatesMock,
        recomputeCandidates: recomputeDuplicateCandidatesMock,
        updateStatus: updateDuplicateCandidateMock,
        mergePeople: mergeDuplicateCandidateMock
      } as unknown as AppServices["personDuplicateService"],
      lifeEventService: lifeEventServiceMock as unknown as AppServices["lifeEventService"],
      personNameService: personNameServiceMock as unknown as AppServices["personNameService"],
      researchTaskService: researchTaskServiceMock as unknown as AppServices["researchTaskService"],
      evidenceService: evidenceServiceMock as unknown as AppServices["evidenceService"],
      familyService: {
        listFamilies: vi.fn().mockResolvedValue([]),
        getFamily: vi.fn(),
        listFamiliesForPerson: vi.fn().mockResolvedValue([]),
        createFamily: vi.fn(),
        patchFamily: vi.fn(),
        deleteFamily: vi.fn(),
        findAdoptedChildPersonIds: findAdoptedChildPersonIdsMock
      } as unknown as AppServices["familyService"]
    };

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
    expect(upsertRelationshipMock).toHaveBeenCalledWith("user-1", "p1", "p2", "FRIEND_OF");
  });

  it("creates spouse relationship edge with optional dates", async () => {
    upsertRelationshipMock.mockResolvedValueOnce({
      direct: { id: "r-spouse-1", fromPersonId: "p1", toPersonId: "p2" },
      inverse: { id: "r-spouse-2", fromPersonId: "p2", toPersonId: "p1" }
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
    expect(upsertRelationshipMock).toHaveBeenCalledWith("user-1", "p1", "p2", "SPOUSE_OF");
    expect(lifeEventServiceMock.syncSpouseDatesToLifeEvents).toHaveBeenCalledWith("user-1", "p1", "p2", {
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
    hasSpouseRelationshipMock.mockResolvedValueOnce(true);

    const response = await app.inject({
      method: "PATCH",
      url: "/people/p1/relationships",
      payload: {
        toPersonId: "p2",
        marriageAnniversaryDate: "2006-01-20"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(hasSpouseRelationshipMock).toHaveBeenCalledWith("user-1", "p1", "p2");
    expect(lifeEventServiceMock.syncSpouseDatesToLifeEvents).toHaveBeenCalledWith("user-1", "p1", "p2", {
      marriageAnniversaryDate: "2006-01-20",
      divorceDate: undefined
    });
    expect(response.json()).toEqual({ updatedCount: 2 });
  });

  it("loads people via treemich backend", async () => {
    const mockPerson = {
      id: "p1",
      givenName: "Mike",
      surname: null,
      gender: "MALE",
      externalIdentities: [],
      thumbnails: []
    };
    listPersonServiceMock.mockResolvedValueOnce([mockPerson]);
    getConnectedPersonIdsMock.mockResolvedValueOnce(new Set(["p1"]));

    const response = await app.inject({
      method: "GET",
      url: "/people"
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.people).toHaveLength(1);
    expect(json.people[0].id).toBe("p1");
    expect(json.people[0].hasRelationship).toBe(true);
  });

  it("lists duplicate candidates", async () => {
    listDuplicateCandidatesMock.mockResolvedValueOnce([{ id: "dup-1", status: "PENDING" }]);

    const response = await app.inject({
      method: "GET",
      url: "/people/duplicates?status=PENDING&limit=25"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ candidates: [{ id: "dup-1", status: "PENDING" }] });
    expect(listDuplicateCandidatesMock).toHaveBeenCalledWith("user-1", { status: "PENDING", limit: 25 });
  });

  it("recomputes duplicate candidates", async () => {
    recomputeDuplicateCandidatesMock.mockResolvedValueOnce({
      candidates: [],
      summary: { created: 1, updated: 0, preservedDismissed: 0, pending: 1 }
    });

    const response = await app.inject({
      method: "POST",
      url: "/people/duplicates/recompute"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      candidates: [],
      summary: { created: 1, updated: 0, preservedDismissed: 0, pending: 1 }
    });
    expect(recomputeDuplicateCandidatesMock).toHaveBeenCalledWith("user-1");
  });

  it("dismisses duplicate candidates", async () => {
    updateDuplicateCandidateMock.mockResolvedValueOnce({ id: "dup-1", status: "DISMISSED" });

    const response = await app.inject({
      method: "PATCH",
      url: "/people/duplicates/dup-1",
      payload: { status: "DISMISSED" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: "dup-1", status: "DISMISSED" });
    expect(updateDuplicateCandidateMock).toHaveBeenCalledWith("user-1", "dup-1", "DISMISSED");
  });

  it("merges duplicate candidates after explicit confirmation", async () => {
    mergeDuplicateCandidateMock.mockResolvedValueOnce({
      auditId: "audit-1",
      canonicalPersonId: "p1",
      duplicatePersonId: "p2"
    });

    const response = await app.inject({
      method: "POST",
      url: "/people/duplicates/dup-1/merge",
      payload: { canonicalPersonId: "p1", duplicatePersonId: "p2", confirm: true }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      auditId: "audit-1",
      canonicalPersonId: "p1",
      duplicatePersonId: "p2"
    });
    expect(mergeDuplicateCandidateMock).toHaveBeenCalledWith("user-1", "dup-1", "p1", "p2");
  });

  it("updates gender profile", async () => {
    updatePersonServiceMock.mockResolvedValueOnce({ id: "pp1", gender: "MALE" });

    const response = await app.inject({
      method: "PATCH",
      url: "/people/p1",
      payload: {
        gender: "MALE"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updatePersonServiceMock).toHaveBeenCalledWith("user-1", "p1", {
      gender: "MALE"
    });
  });

  it("updates extended person profile fields", async () => {
    updatePersonServiceMock.mockResolvedValueOnce({
      id: "pp1",
      gender: "FEMALE",
      givenName: "Alex",
      surname: "Johnson",
      nicknames: "AJ"
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/people/p1",
      payload: {
        givenName: "Alex",
        surname: "Johnson",
        nicknames: "AJ",
        deathDate: null
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updatePersonServiceMock).toHaveBeenCalledWith("user-1", "p1", {
      givenName: "Alex",
      surname: "Johnson",
      nicknames: "AJ",
      deathDate: null
    });
    expect(lifeEventServiceMock.syncPersonProfileFieldsToLifeEvents).toHaveBeenCalledWith("user-1", "pp1", {
      deathDate: null
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

  it("searches standalone Treemich relatives without an Immich-linked session", async () => {
    requireSessionMock.mockResolvedValueOnce({
      ...authContext,
      linkedAccount: null,
      user: { ...authContext.user, linkedAccount: null }
    });
    personProfileFindManyMock.mockResolvedValueOnce([
      makeSearchPersonRow({ id: "mike-id", name: "Mike" }),
      makeSearchPersonRow({ id: "zoe-id", name: "Zoe" })
    ]);
    traverseRelationshipChainMock.mockResolvedValueOnce(["zoe-id"]);
    getProfilesForPersonIdsMock.mockResolvedValueOnce(
      new Map([["zoe-id", { id: "zoe-id", gender: "FEMALE" }]])
    );

    const response = await app.inject({
      method: "GET",
      url: "/search?q=daughter%20of%20Mike"
    });

    expect(response.statusCode).toBe(200);
    expect(getClientMock).not.toHaveBeenCalled();
    expect(listPeopleMock).not.toHaveBeenCalled();
    expect(traverseRelationshipChainMock).toHaveBeenCalledWith("user-1", ["mike-id"], ["CHILD_OF"]);
    const json = response.json();
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].person.name).toBe("Zoe");
  });

  it("matches NL search sources by linked external identity display name", async () => {
    personProfileFindManyMock.mockResolvedValueOnce([
      makeSearchPersonRow({ id: "source-id", name: "Person source-id", externalDisplayName: "Mike" }),
      makeSearchPersonRow({ id: "target-id", name: "Jane" })
    ]);
    traverseRelationshipChainMock.mockResolvedValueOnce(["target-id"]);
    getProfilesForPersonIdsMock.mockResolvedValueOnce(
      new Map([["target-id", { id: "target-id", gender: "FEMALE" }]])
    );

    const response = await app.inject({
      method: "GET",
      url: "/search?q=daughter%20of%20Mike"
    });

    expect(response.statusCode).toBe(200);
    expect(traverseRelationshipChainMock).toHaveBeenCalledWith("user-1", ["source-id"], ["CHILD_OF"]);
    const json = response.json();
    expect(json.sourceCandidates[0].name).toBe("Person source-id");
    expect(json.matches[0].person.name).toBe("Jane");
  });

  it("matches NL search sources by alternate names by default", async () => {
    treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({ preferences: {} });
    personProfileFindManyMock.mockResolvedValueOnce([
      makeSearchPersonRow({
        id: "source-id",
        name: "Eliza Smith",
        alternateNames: [{ givenName: "Beth", surname: "Smith", prefix: null, suffix: null }]
      }),
      makeSearchPersonRow({ id: "target-id", name: "Jane" })
    ]);
    traverseRelationshipChainMock.mockResolvedValueOnce(["target-id"]);
    getProfilesForPersonIdsMock.mockResolvedValueOnce(
      new Map([["target-id", { id: "target-id", gender: "FEMALE" }]])
    );

    const response = await app.inject({
      method: "GET",
      url: "/search?q=daughter%20of%20Beth"
    });

    expect(response.statusCode).toBe(200);
    expect(traverseRelationshipChainMock).toHaveBeenCalledWith("user-1", ["source-id"], ["CHILD_OF"]);
    expect(response.json().matches[0].person.name).toBe("Jane");
  });

  it("excludes alternate names from NL search when disabled", async () => {
    treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({
      preferences: { searchIncludeAlternateNames: false }
    });
    personProfileFindManyMock.mockResolvedValueOnce([
      makeSearchPersonRow({
        id: "source-id",
        name: "Eliza Smith",
        alternateNames: [{ givenName: "Beth", surname: "Smith", prefix: null, suffix: null }]
      }),
      makeSearchPersonRow({ id: "target-id", name: "Jane" })
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/search?q=daughter%20of%20Beth"
    });

    expect(response.statusCode).toBe(200);
    expect(traverseRelationshipChainMock).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({
      sourceCandidates: [],
      matches: [],
      message: "No person found for Beth"
    });
  });

  it("searches adopted children via family pedigree instead of graph hops", async () => {
    findAdoptedChildPersonIdsMock.mockResolvedValueOnce(["ada-id"]);
    getProfilesForPersonIdsMock.mockResolvedValueOnce(new Map([["ada-id", { gender: "FEMALE" }]]));
    listPeopleMock.mockResolvedValueOnce([
      { id: "ada-id", name: "Ada" },
      { id: "mike-id", name: "Mike" }
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/search?q=adopted%20children%20of%20Mike"
    });

    expect(response.statusCode).toBe(200);
    expect(findAdoptedChildPersonIdsMock).toHaveBeenCalledWith("user-1", ["mike-id"]);
    expect(traverseRelationshipChainMock).toHaveBeenCalledTimes(0);
    const json = response.json();
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].person.name).toBe("Ada");
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
          ["c-young", { id: "pp-young", gender: "MALE" }],
          ["c-old", { id: "pp-old", gender: "FEMALE" }],
          ["c-nodate", { id: "pp-nodate", gender: "MALE" }]
        ])
      );
      lifeEventServiceMock.getBirthDeathByPersonProfileIds.mockResolvedValueOnce(
        new Map([
          ["pp-young", { birth: { year: 2010, month: 6, day: 15 }, death: null }],
          ["pp-old", { birth: { year: 1980, month: 1, day: 1 }, death: null }],
          ["pp-nodate", { birth: null, death: null }]
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
          ["a-1", { id: "pp-a1", gender: "FEMALE" }],
          ["a-2", { id: "pp-a2", gender: "FEMALE" }]
        ])
      );
      lifeEventServiceMock.getBirthDeathByPersonProfileIds.mockResolvedValueOnce(
        new Map([
          ["pp-a1", { birth: { year: 2005, month: 3, day: 10 }, death: null }],
          ["pp-a2", { birth: { year: 1990, month: 7, day: 20 }, death: null }]
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
          ["sc-f-old", { id: "pp-scfo", gender: "FEMALE" }],
          ["sc-m-old", { id: "pp-scmo", gender: "MALE" }],
          ["sc-f-young", { id: "pp-scfy", gender: "FEMALE" }]
        ])
      );
      lifeEventServiceMock.getBirthDeathByPersonProfileIds.mockResolvedValueOnce(
        new Map([
          ["pp-scfo", { birth: { year: 1990, month: 1, day: 1 }, death: null }],
          ["pp-scmo", { birth: { year: 1985, month: 1, day: 1 }, death: null }],
          ["pp-scfy", { birth: { year: 2015, month: 1, day: 1 }, death: null }]
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

    it("uses person-native birth events for age filters", async () => {
      traverseRelationshipChainMock.mockResolvedValueOnce(["c-1"]);
      getProfilesForPersonIdsMock.mockResolvedValueOnce(new Map([["c-1", { id: "pp-c1", gender: "MALE" }]]));
      lifeEventServiceMock.getBirthDeathByPersonProfileIds.mockResolvedValueOnce(
        new Map([["pp-c1", { birth: { year: 1990, month: 5, day: 15 }, death: null }]])
      );
      listPeopleMock.mockResolvedValueOnce([
        { id: "mike-id", name: "Mike" },
        { id: "c-1", name: "Cousin With Person Date" }
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/search?q=cousins%20of%20Mike%20born%20in%201990"
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.matches).toHaveLength(1);
      expect(json.matches[0].person.name).toBe("Cousin With Person Date");
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
        password: "secret",
        provider: "immich"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(loginWithImmichMock).toHaveBeenCalledWith("mike@example.com", "secret");
    expect(response.headers["set-cookie"]).toContain("treemich_session=session-token");
  });

  it("rate limits auth/login with the shared expensive route limit", async () => {
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

    for (let attempt = 0; attempt < EXPENSIVE_ROUTE_RATE_LIMIT.max; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "mike@example.com",
          password: "secret",
          provider: "immich"
        }
      });

      expect(response.statusCode).toBe(200);
    }

    const rateLimitedResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "mike@example.com",
        password: "secret",
        provider: "immich"
      }
    });

    expect(rateLimitedResponse.statusCode).toBe(429);
  });

  it("logs in with standalone Treemich credentials (provider: treemich) without Immich", async () => {
    loginWithPasswordMock.mockResolvedValueOnce({
      sessionToken: "standalone-token",
      state: {
        authenticated: true,
        user: { id: "user-standalone", email: "bob@example.com", name: "Bob" },
        linkStatus: { linked: false }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "bob@example.com", password: "mypassword" }
    });

    expect(response.statusCode).toBe(200);
    expect(loginWithPasswordMock).toHaveBeenCalledWith("bob@example.com", "mypassword");
    expect(loginWithImmichMock).not.toHaveBeenCalled();
    expect(response.headers["set-cookie"]).toContain("treemich_session=standalone-token");
  });

  it("defaults POST /auth/login to provider=treemich when provider is omitted", async () => {
    loginWithPasswordMock.mockResolvedValueOnce({
      sessionToken: "tok",
      state: {
        authenticated: true,
        user: { id: "u1", email: "a@b.com", name: "A" },
        linkStatus: { linked: false }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "a@b.com", password: "pw" }
    });

    expect(response.statusCode).toBe(200);
    expect(loginWithPasswordMock).toHaveBeenCalledTimes(1);
    expect(loginWithImmichMock).not.toHaveBeenCalled();
  });

  it("creates a new person via POST /people and syncs birthDate as a life event", async () => {
    createPersonServiceMock.mockResolvedValueOnce({
      id: "pp-new",
      name: "Carol Jones",
      profile: { id: "pp-new", gender: "FEMALE", givenName: "Carol", surname: "Jones" },
      externalIdentities: [],
      thumbnail: null,
      hasRelationship: false
    });

    const response = await app.inject({
      method: "POST",
      url: "/people",
      payload: { givenName: "Carol", surname: "Jones", gender: "FEMALE", birthDate: "1990-05-15" }
    });

    expect(response.statusCode).toBe(201);
    expect(createPersonServiceMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ givenName: "Carol", surname: "Jones", gender: "FEMALE" })
    );
    expect(lifeEventServiceMock.syncPersonProfileFieldsToLifeEvents).toHaveBeenCalledWith(
      "user-1",
      "pp-new",
      expect.objectContaining({ birthDate: "1990-05-15" })
    );
    expect(response.json().id).toBe("pp-new");
  });

  it("creates a person via POST /people without a birthDate and skips life-event sync", async () => {
    createPersonServiceMock.mockResolvedValueOnce({
      id: "pp-no-birth",
      name: "Dave",
      profile: { id: "pp-no-birth", gender: "UNKNOWN" },
      externalIdentities: [],
      thumbnail: null,
      hasRelationship: false
    });

    const response = await app.inject({
      method: "POST",
      url: "/people",
      payload: { givenName: "Dave" }
    });

    expect(response.statusCode).toBe(201);
    expect(lifeEventServiceMock.syncPersonProfileFieldsToLifeEvents).not.toHaveBeenCalled();
  });

  it("returns a single person via GET /people/:id", async () => {
    getPersonServiceMock.mockResolvedValueOnce({
      id: "pp-1",
      userId: "user-1",
      gender: "MALE",
      givenName: "Alice",
      surname: "Smith",
      displayNameOverride: null,
      nicknames: null,
      externalIds: {},
      externalIdentities: [],
      thumbnails: [],
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01")
    });

    const response = await app.inject({ method: "GET", url: "/people/pp-1" });

    expect(response.statusCode).toBe(200);
    expect(getPersonServiceMock).toHaveBeenCalledWith("user-1", "pp-1");
    expect(response.json().person.id).toBe("pp-1");
  });

  it("returns 404 when GET /people/:id cannot find the person", async () => {
    const { HttpNotFoundError } = await import("../src/lifeEvents/errors.js");
    getPersonServiceMock.mockRejectedValueOnce(new HttpNotFoundError("Person not found"));

    const response = await app.inject({ method: "GET", url: "/people/ghost" });

    expect(response.statusCode).toBe(404);
  });

  it("adds an external identity via POST /people/:id/external-identities", async () => {
    addExternalIdentityMock.mockResolvedValueOnce({
      id: "ident-new",
      personId: "pp-1",
      provider: "IMMICH",
      providerPersonId: "immich-xyz",
      providerBaseUrl: null,
      displayName: null,
      thumbnailImportedAt: null,
      lastSeenAt: null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const response = await app.inject({
      method: "POST",
      url: "/people/pp-1/external-identities",
      payload: { provider: "IMMICH", providerPersonId: "immich-xyz" }
    });

    expect(response.statusCode).toBe(201);
    expect(addExternalIdentityMock).toHaveBeenCalledWith(
      "user-1",
      "pp-1",
      expect.objectContaining({ provider: "IMMICH", providerPersonId: "immich-xyz" })
    );
    expect(response.json().id).toBe("ident-new");
  });

  it("returns 409 when POST /people/:id/external-identities conflicts", async () => {
    const { HttpConflictError } = await import("../src/lifeEvents/errors.js");
    addExternalIdentityMock.mockRejectedValueOnce(new HttpConflictError("External identity already exists"));

    const response = await app.inject({
      method: "POST",
      url: "/people/pp-1/external-identities",
      payload: { provider: "IMMICH", providerPersonId: "immich-dupe" }
    });

    expect(response.statusCode).toBe(409);
  });

  it("lists external identities via GET /people/:id/external-identities", async () => {
    listExternalIdentitiesMock.mockResolvedValueOnce([
      { id: "ident-1", personId: "pp-1", provider: "IMMICH", providerPersonId: "immich-abc" }
    ]);

    const response = await app.inject({ method: "GET", url: "/people/pp-1/external-identities" });

    expect(response.statusCode).toBe(200);
    expect(listExternalIdentitiesMock).toHaveBeenCalledWith("user-1", "pp-1");
    expect(response.json().externalIdentities).toHaveLength(1);
  });

  it("deletes an external identity via DELETE /people/:id/external-identities/:identityId", async () => {
    deleteExternalIdentityMock.mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: "DELETE",
      url: "/people/pp-1/external-identities/ident-1"
    });

    expect(response.statusCode).toBe(204);
    expect(deleteExternalIdentityMock).toHaveBeenCalledWith("user-1", "pp-1", "ident-1");
  });

  it("returns 404 when DELETE /people/:id/external-identities/:identityId does not exist", async () => {
    const { HttpNotFoundError } = await import("../src/lifeEvents/errors.js");
    deleteExternalIdentityMock.mockRejectedValueOnce(new HttpNotFoundError("External identity not found"));

    const response = await app.inject({
      method: "DELETE",
      url: "/people/pp-1/external-identities/ghost-ident"
    });

    expect(response.statusCode).toBe(404);
  });

  it("deletes a person via DELETE /people/:id", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/people/pp-1"
    });

    expect(response.statusCode).toBe(204);
    expect(deletePersonServiceMock).toHaveBeenCalledWith("user-1", "pp-1");
  });

  it("returns 404 when DELETE /people/:id cannot find the person for this user", async () => {
    const { HttpNotFoundError } = await import("../src/lifeEvents/errors.js");
    deletePersonServiceMock.mockRejectedValueOnce(new HttpNotFoundError("Person not found"));

    const response = await app.inject({
      method: "DELETE",
      url: "/people/other-user-person"
    });

    expect(response.statusCode).toBe(404);
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
    it("returns defaults when user has no saved preferences", async () => {
      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({ preferences: {} });

      const response = await app.inject({
        method: "GET",
        url: "/user/preferences"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        graphRenderLimit: defaultGraphRenderLimit,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences,
        searchIncludeAlternateNames: true
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
        graphRenderLimit: defaultGraphRenderLimit,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        graphFilterVisibility: {
          parentChild: true,
          spouse: true,
          sibling: false,
          friends: true,
          pets: false
        },
        cooccurrence: defaultCooccurrencePreferences,
        searchIncludeAlternateNames: true
      });
    });

    it("returns defaults when stored preferences are corrupted", async () => {
      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({
        preferences: { familyViewStyle: "nonExistentStyle", extra: 123 }
      });

      const response = await app.inject({
        method: "GET",
        url: "/user/preferences"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        graphRenderLimit: defaultGraphRenderLimit,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences,
        searchIncludeAlternateNames: true
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
        graphRenderLimit: defaultGraphRenderLimit,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences,
        searchIncludeAlternateNames: true
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
        graphRenderLimit: defaultGraphRenderLimit,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences,
        searchIncludeAlternateNames: true
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
      expect(json.graphRenderLimit).toBe(defaultGraphRenderLimit);
      expect(json.showSingleFamilyTree).toBe(defaultShowSingleFamilyTree);
    });

    it("persists graph render limit preferences", async () => {
      const existing = { familyViewStyle: "generationTree" };
      const merged = { ...existing, graphRenderLimit: 240 };
      treemichUserFindUniqueOrThrowMock.mockResolvedValueOnce({ preferences: existing });
      treemichUserUpdateMock.mockResolvedValueOnce({ preferences: merged });

      const response = await app.inject({
        method: "PATCH",
        url: "/user/preferences",
        payload: { graphRenderLimit: 240 }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ...merged,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences,
        searchIncludeAlternateNames: true
      });
      expect(treemichUserUpdateMock).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { preferences: merged },
        select: { preferences: true }
      });
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
        graphRenderLimit: defaultGraphRenderLimit,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences,
        searchIncludeAlternateNames: true
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
        graphRenderLimit: defaultGraphRenderLimit,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences,
        searchIncludeAlternateNames: true
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
        graphRenderLimit: defaultGraphRenderLimit,
        showSingleFamilyTree: defaultShowSingleFamilyTree,
        primaryFamilyUnitByPersonId: {},
        cooccurrence: defaultCooccurrencePreferences,
        searchIncludeAlternateNames: true
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

    it("rejects graph render limits outside supported bounds", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/user/preferences",
        payload: { graphRenderLimit: 5 }
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

  it("returns life event validation findings for a person", async () => {
    const findings = [
      {
        code: "birth_after_death",
        severity: "error" as const,
        message: "BIRTH is dated after DEATH for this person."
      }
    ];
    lifeEventServiceMock.validatePersonLifeEvents.mockResolvedValueOnce({ findings });

    const response = await app.inject({
      method: "GET",
      url: "/people/p1/life-events/validation"
    });

    expect(response.statusCode).toBe(200);
    expect(lifeEventServiceMock.validatePersonLifeEvents).toHaveBeenCalledWith("user-1", "p1");
    expect(response.json()).toEqual({ findings });
  });

  it("returns tree validation with engine flags (read-only aggregate)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/tree/validation"
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { findings: unknown[]; engineDisabled: boolean; persist: boolean };
    expect(Array.isArray(body.findings)).toBe(true);
    expect(body.engineDisabled).toBe(false);
    expect(body.persist).toBe(false);
  });

  it("lists person names", async () => {
    personNameServiceMock.listByPersonId.mockResolvedValueOnce([
      {
        id: "n1",
        type: "BIRTH",
        givenName: "A",
        surname: "B",
        prefix: null,
        suffix: null,
        isPrimary: true,
        notes: null,
        display: "A B",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    const response = await app.inject({
      method: "GET",
      url: "/people/p1/names"
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      names: [
        {
          id: "n1",
          type: "BIRTH",
          givenName: "A",
          surname: "B",
          prefix: null,
          suffix: null,
          isPrimary: true,
          notes: null,
          display: "A B",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    });
  });

  it("lists research tasks (person + global)", async () => {
    researchTaskServiceMock.list.mockResolvedValueOnce([
      {
        id: "rt1",
        title: "Find census record",
        status: "OPEN",
        personId: "p1",
        dueDate: null,
        notes: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    const response = await app.inject({
      method: "GET",
      url: "/research/tasks?personId=p1"
    });
    expect(response.statusCode).toBe(200);
    expect(researchTaskServiceMock.list).toHaveBeenCalledWith("user-1", "p1");
    expect(response.json()).toEqual({
      tasks: [
        {
          id: "rt1",
          title: "Find census record",
          status: "OPEN",
          personId: "p1",
          dueDate: null,
          notes: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    });
  });

  it("returns person timeline sorted by date key", async () => {
    lifeEventServiceMock.listPersonLifeEvents.mockResolvedValueOnce([
      {
        id: "e1",
        eventType: "DEATH",
        dateQualifier: "EXACT",
        year: 2020,
        month: 1,
        day: 1,
        endYear: null,
        endMonth: null,
        endDay: null,
        placeId: null,
        notes: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        personProfileId: "pp1",
        relationshipId: null,
        place: null,
        citations: []
      },
      {
        id: "e0",
        eventType: "BIRTH",
        dateQualifier: "EXACT",
        year: 1980,
        month: 1,
        day: 1,
        endYear: null,
        endMonth: null,
        endDay: null,
        placeId: null,
        notes: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        personProfileId: "pp1",
        relationshipId: null,
        place: null,
        citations: []
      }
    ]);
    const response = await app.inject({
      method: "GET",
      url: "/people/p1/timeline"
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { timeline: Array<{ id: string; dateSortKey: number }> };
    expect(body.timeline.map((event) => event.id)).toEqual(["e0", "e1"]);
  });

  it("returns map places feed with aggregate counts", async () => {
    lifeEventFindManyForExportMock
      .mockResolvedValueOnce([
        {
          year: 1950,
          personProfile: { id: "p1" },
          place: { id: "pl1", name: "Paris", latitude: 48.8566, longitude: 2.3522 }
        },
        {
          year: 1970,
          personProfile: { id: "p2" },
          place: { id: "pl1", name: "Paris", latitude: 48.8566, longitude: 2.3522 }
        }
      ])
      .mockResolvedValueOnce([]);
    const response = await app.inject({
      method: "GET",
      url: "/places/map"
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      mapUiEnabled: true,
      places: [
        {
          id: "pl1",
          name: "Paris",
          latitude: 48.8566,
          longitude: 2.3522,
          eventCount: 2,
          personCount: 2,
          lastEventYear: 1970,
          samplePersonIds: ["p1", "p2"]
        }
      ]
    });
  });

  it("filters map places for deceased-only mode when includeLiving=false", async () => {
    lifeEventFindManyForExportMock
      .mockResolvedValueOnce([
        {
          year: 1950,
          personProfile: { id: "p1" },
          place: { id: "pl1", name: "Paris", latitude: 48.8566, longitude: 2.3522 }
        },
        {
          year: 1970,
          personProfile: { id: "p2" },
          place: { id: "pl1", name: "Paris", latitude: 48.8566, longitude: 2.3522 }
        }
      ])
      .mockResolvedValueOnce([{ personProfileId: "p2" }]);

    const response = await app.inject({
      method: "GET",
      url: "/places/map?includeLiving=false"
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      mapUiEnabled: true,
      places: [
        {
          id: "pl1",
          name: "Paris",
          latitude: 48.8566,
          longitude: 2.3522,
          eventCount: 1,
          personCount: 1,
          lastEventYear: 1970,
          samplePersonIds: ["p2"]
        }
      ]
    });
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
        eventType: "BIRTH",
        year: 2000,
        day: 15
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when CUSTOM life event omits customLabel (Zod)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/people/p1/life-events",
      payload: {
        eventType: "CUSTOM",
        year: 1900,
        month: 1,
        day: 1
      }
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { issues?: { path: (string | number)[] }[] };
    expect(body.issues?.some((i) => i.path.includes("customLabel"))).toBe(true);
    expect(lifeEventServiceMock.createPersonLifeEvent).not.toHaveBeenCalled();
  });

  it("returns 204 when merging evidence sources", async () => {
    evidenceServiceMock.mergeSources.mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: "POST",
      url: "/evidence/sources/merge",
      payload: { fromSourceId: "src-a", intoSourceId: "src-b" }
    });

    expect(response.statusCode).toBe(204);
    expect(evidenceServiceMock.mergeSources).toHaveBeenCalledWith("user-1", "src-a", "src-b");
  });

  it("lists relationship life events with citations when include=citations (UI parity)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/relationships/rel-1/life-events?include=citations"
    });

    expect(response.statusCode).toBe(200);
    expect(lifeEventServiceMock.listRelationshipLifeEvents).toHaveBeenCalledWith("user-1", "rel-1", {
      includeCitations: true
    });
    expect(response.json()).toEqual({ lifeEvents: [] });
  });

  it("lists family life events with citations when include=citations", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/families/fam-1/life-events?include=citations"
    });

    expect(response.statusCode).toBe(200);
    expect(lifeEventServiceMock.listFamilyLifeEvents).toHaveBeenCalledWith("user-1", "fam-1", {
      includeCitations: true
    });
    expect(response.json()).toEqual({ lifeEvents: [] });
  });

  it("lists family life events without include query (omits citations by default)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/families/fam-2/life-events"
    });

    expect(response.statusCode).toBe(200);
    expect(lifeEventServiceMock.listFamilyLifeEvents).toHaveBeenCalledWith("user-1", "fam-2", {
      includeCitations: false
    });
    expect(response.json()).toEqual({ lifeEvents: [] });
  });

  it("returns 400 when POST family life event type is not allowed on families", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/families/fam-1/life-events",
      payload: {
        eventType: "MARRIAGE",
        year: 1910
      }
    });

    expect(response.statusCode).toBe(400);
    expect(lifeEventServiceMock.createFamilyLifeEvent).toHaveBeenCalledTimes(0);
  });

  it("creates family life event and returns JSON row", async () => {
    lifeEventServiceMock.createFamilyLifeEvent.mockResolvedValueOnce({
      id: "flev-1",
      userId: "user-1",
      eventType: "RESIDENCE",
      dateQualifier: "EXACT",
      year: 1920,
      month: null,
      day: null,
      endYear: null,
      endMonth: null,
      endDay: null,
      notes: "Farm",
      personProfileId: null,
      relationshipId: null,
      familyId: "fam-1",
      placeId: null,
      place: null,
      citations: [],
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
      updatedAt: new Date("2020-01-01T00:00:00.000Z")
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/families/fam-1/life-events",
      payload: {
        eventType: "RESIDENCE",
        year: 1920
      }
    });

    expect(response.statusCode).toBe(200);
    expect(lifeEventServiceMock.createFamilyLifeEvent).toHaveBeenCalledWith(
      "user-1",
      "fam-1",
      expect.objectContaining({ eventType: "RESIDENCE", year: 1920 })
    );
    const json = response.json() as { id: string; eventType: string; familyId: string | null };
    expect(json.id).toBe("flev-1");
    expect(json.eventType).toBe("RESIDENCE");
    expect(json.familyId).toBe("fam-1");
  });

  it("patches family life event and returns JSON row", async () => {
    lifeEventServiceMock.updateFamilyLifeEvent.mockResolvedValueOnce({
      id: "flev-2",
      userId: "user-1",
      eventType: "CENSUS",
      dateQualifier: "EXACT",
      year: 1880,
      month: null,
      day: null,
      endYear: null,
      endMonth: null,
      endDay: null,
      notes: "Roll",
      personProfileId: null,
      relationshipId: null,
      familyId: "fam-1",
      placeId: null,
      place: null,
      citations: [],
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
      updatedAt: new Date("2020-01-02T00:00:00.000Z")
    } as never);

    const response = await app.inject({
      method: "PATCH",
      url: "/families/fam-1/life-events/flev-2",
      payload: { notes: "Roll" }
    });

    expect(response.statusCode).toBe(200);
    expect(lifeEventServiceMock.updateFamilyLifeEvent).toHaveBeenCalledWith(
      "user-1",
      "fam-1",
      "flev-2",
      expect.objectContaining({ notes: "Roll" })
    );
    expect((response.json() as { notes: string }).notes).toBe("Roll");
  });

  it("returns 404 when PATCH family life event misses family or event", async () => {
    lifeEventServiceMock.updateFamilyLifeEvent.mockRejectedValueOnce(
      new HttpNotFoundError("Life event not found")
    );

    const response = await app.inject({
      method: "PATCH",
      url: "/families/fam-1/life-events/missing",
      payload: { notes: "x" }
    });

    expect(response.statusCode).toBe(404);
  });

  it("deletes family life event with 204", async () => {
    lifeEventServiceMock.deleteFamilyLifeEvent.mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: "DELETE",
      url: "/families/fam-1/life-events/flev-9"
    });

    expect(response.statusCode).toBe(204);
    expect(lifeEventServiceMock.deleteFamilyLifeEvent).toHaveBeenCalledWith("user-1", "fam-1", "flev-9");
  });

  it("returns birthDate from personService when present", async () => {
    const mockPerson = {
      id: "pp1",
      givenName: "Mike",
      surname: null,
      gender: "MALE",
      birthDate: "2001-03-14",
      externalIdentities: [],
      thumbnails: []
    };
    listPersonServiceMock.mockResolvedValueOnce([mockPerson]);
    getConnectedPersonIdsMock.mockResolvedValueOnce(new Set(["pp1"]));

    const response = await app.inject({
      method: "GET",
      url: "/people"
    });

    expect(response.statusCode).toBe(200);
    const json = response.json() as { people: Array<{ birthDate: string | null }> };
    expect(json.people[0]?.birthDate).toBe("2001-03-14");
  });

  describe("GET /export/account", () => {
    afterEach(() => {
      requireSessionMock.mockResolvedValue(authContext);
    });

    it("returns 401 without a valid session", async () => {
      const { TreemichAuthError } = await import("../src/auth/service.js");
      requireSessionMock.mockRejectedValueOnce(new TreemichAuthError("Unauthorized"));

      const response = await app.inject({
        method: "GET",
        url: "/export/account"
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 404 when the Treemich user row is missing", async () => {
      treemichUserFindUniqueMock.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/export/account"
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ statusCode: 404 });
    });

    it("returns JSON attachment with export v2 person-native data and no secrets", async () => {
      const createdAt = new Date("2024-06-01T12:00:00.000Z");
      treemichUserFindUniqueMock.mockResolvedValueOnce({
        id: "user-1",
        immichBaseUrl: "http://localhost:2283/api",
        immichUserId: "immich-user-1",
        immichEmail: "mike@example.com",
        immichName: "Mike",
        preferences: {},
        createdAt,
        updatedAt: createdAt
      });
      personProfileFindManyMock.mockResolvedValueOnce([
        {
          id: "pp-1",
          userId: "user-1",
          gender: "MALE",
          displayNameOverride: null,
          givenName: "Mike",
          surname: "Smith",
          nicknames: null,
          externalIds: {},
          createdAt,
          updatedAt: createdAt
        }
      ]);
      personExternalIdentityFindManyMock.mockResolvedValueOnce([
        {
          id: "ident-1",
          userId: "user-1",
          personId: "pp-1",
          provider: "IMMICH",
          providerPersonId: "p1",
          providerBaseUrl: "http://localhost:2283/api",
          displayName: "Mike",
          thumbnailImportedAt: null,
          lastSeenAt: createdAt,
          metadata: {},
          createdAt,
          updatedAt: createdAt
        }
      ]);
      personThumbnailFindManyMock.mockResolvedValueOnce([
        {
          id: "thumb-1",
          userId: "user-1",
          personId: "pp-1",
          source: "IMMICH",
          storageUrl: null,
          mimeType: "image/jpeg",
          checksum: "abc123",
          sourceExternalIdentityId: "ident-1",
          importedAt: createdAt,
          createdAt,
          updatedAt: createdAt
        }
      ]);
      relationshipFindManyForExportMock.mockResolvedValueOnce([]);
      placeFindManyMock.mockResolvedValueOnce([]);
      lifeEventFindManyForExportMock.mockResolvedValueOnce([
        {
          id: "le-1",
          userId: "user-1",
          eventType: "BIRTH",
          dateQualifier: "EXACT",
          year: 1990,
          month: 5,
          day: 10,
          endYear: null,
          endMonth: null,
          endDay: null,
          personProfileId: "pp-1",
          relationshipId: null,
          placeId: null,
          notes: null,
          createdAt,
          updatedAt: createdAt,
          place: null,
          citations: []
        }
      ]);
      treemichSessionFindManyMock.mockResolvedValueOnce([
        {
          id: "sess-1",
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
          createdAt,
          updatedAt: createdAt
        }
      ]);
      linkedImmichAccountFindUniqueMock.mockResolvedValueOnce({
        id: "link-1",
        immichBaseUrl: "http://localhost:2283/api",
        immichUserId: "immich-user-1",
        immichEmail: "mike@example.com",
        immichName: "Mike",
        accessTokenExpiresAt: null,
        lastValidatedAt: null,
        createdAt,
        updatedAt: createdAt
      });
      cooccurrenceJobFindManyMock.mockResolvedValueOnce([]);
      cooccurrenceEdgeFindManyMock.mockResolvedValueOnce([]);
      cooccurrenceScheduleFindUniqueMock.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/export/account"
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.headers["content-disposition"]).toMatch(/attachment/i);
      expect(response.headers["content-disposition"]).toContain("treemich-account-export-user-1");

      const payload = response.json() as {
        exportVersion: number;
        exportedAt: string;
        treemichUser: { id: string };
        people: unknown[];
        personExternalIdentities: unknown[];
        personThumbnails: unknown[];
        lifeEvents: Array<{ id: string; eventType: string }>;
        treemichSessions: Array<Record<string, unknown>>;
        linkedImmichAccount: Record<string, unknown> | null;
      };

      expect(payload.exportVersion).toBe(2);
      expect(payload.exportedAt).toBeTruthy();
      expect(payload.treemichUser.id).toBe("user-1");
      expect(payload.people).toHaveLength(1);
      expect(payload.personExternalIdentities).toHaveLength(1);
      expect(payload.personThumbnails).toHaveLength(1);
      expect(payload.lifeEvents).toHaveLength(1);
      expect(payload.lifeEvents[0]?.eventType).toBe("BIRTH");
      expect(payload.treemichSessions).toHaveLength(1);
      const session0 = payload.treemichSessions[0]!;
      expect(Object.hasOwn(session0, "tokenHash")).toBe(false);
      expect(payload.linkedImmichAccount).toBeTruthy();
      const link = payload.linkedImmichAccount as Record<string, unknown>;
      expect(Object.hasOwn(link, "encryptedAccessToken")).toBe(false);
      expect(Object.hasOwn(link, "accessTokenIv")).toBe(false);
      expect(Object.hasOwn(link, "accessTokenTag")).toBe(false);
    });

    it("returns 400 for unsupported format query", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/export/account?format=xml"
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ statusCode: 400, error: "Invalid format" });
    });

    it("returns ZIP with account.json and manifest.json matching JSON export payload", async () => {
      const createdAt = new Date("2024-06-01T12:00:00.000Z");
      const userRow = {
        id: "user-1",
        immichBaseUrl: "http://localhost:2283/api",
        immichUserId: "immich-user-1",
        immichEmail: "mike@example.com",
        immichName: "Mike",
        preferences: {},
        createdAt,
        updatedAt: createdAt
      };
      treemichUserFindUniqueMock.mockResolvedValueOnce(userRow).mockResolvedValueOnce(userRow);
      personProfileFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      personExternalIdentityFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      personThumbnailFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      relationshipFindManyForExportMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      placeFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      lifeEventFindManyForExportMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      treemichSessionFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      linkedImmichAccountFindUniqueMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      cooccurrenceJobFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      cooccurrenceEdgeFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      cooccurrenceScheduleFindUniqueMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const jsonRes = await app.inject({ method: "GET", url: "/export/account?format=json" });
      const zipRes = await app.inject({ method: "GET", url: "/export/account?format=zip" });

      expect(zipRes.statusCode).toBe(200);
      expect(zipRes.headers["content-type"]).toContain("application/zip");
      expect(zipRes.headers["content-disposition"]).toMatch(/\.zip/i);

      const raw =
        typeof zipRes.rawPayload === "string"
          ? Buffer.from(zipRes.rawPayload, "binary")
          : Buffer.from(zipRes.rawPayload as Buffer);
      expect(raw.subarray(0, 2).toString("utf8")).toBe("PK");

      const zip = new AdmZip(raw);
      const accountInZip = JSON.parse(zip.readAsText("account.json")) as {
        exportVersion: number;
        treemichUser: { id: string };
      };
      const jsonPayload = jsonRes.json() as { exportVersion: number; treemichUser: { id: string } };
      expect(accountInZip.exportVersion).toBe(jsonPayload.exportVersion);
      expect(accountInZip.treemichUser.id).toBe(jsonPayload.treemichUser.id);

      const manifest = JSON.parse(zip.readAsText("manifest.json")) as {
        treemichExportManifestVersion: number;
        payloadExportVersion: number;
        files: Array<{ path: string }>;
      };
      expect(manifest.treemichExportManifestVersion).toBe(1);
      expect(manifest.payloadExportVersion).toBe(2);
      expect(manifest.files.some((f) => f.path === "account.json")).toBe(true);
    });
  });
});
