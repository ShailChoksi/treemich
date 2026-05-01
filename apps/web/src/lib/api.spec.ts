import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiHttpError,
  computeGraphLayout,
  createFamily,
  createFamilyLifeEvent,
  createResearchTask,
  createPersonLifeEvent,
  deletePerson,
  deleteFamily,
  deleteFamilyLifeEvent,
  getFamiliesForPerson,
  getFamilies,
  fetchPedigreeReport,
  fetchFamilyGroupSheetReport,
  getFamilyLifeEvents,
  getDuplicateCandidates,
  getPlacesMap,
  getPersonTimeline,
  getResearchTasks,
  deleteRelationshipLifeEvent,
  getCurrentUser,
  getPersonLifeEventValidation,
  getPersonLifeEvents,
  immichPersonUrl,
  createEvidenceMediaObject,
  createEvidenceMediaLink,
  createEvidenceRepository,
  deleteEvidenceMediaLink,
  getMediaLinksForTarget,
  getValidationFindings,
  listEvidenceMediaObjects,
  listEvidenceMediaLinks,
  listEvidenceRepositories,
  listEvidenceSources,
  login,
  logout,
  mergeDuplicateCandidate,
  mergeEvidenceSources,
  patchFamily,
  recomputeDuplicateCandidates,
  recomputeValidationFindings,
  updateDuplicateCandidate,
  updateValidationFinding,
  updateFamilyLifeEvent
} from "./api";

describe("session-auth API helpers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("logs in with cookie credentials enabled", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    await login("mike@example.com", "secret");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include"
      })
    );
  });

  it("loads the current user session without custom headers", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: false, linkStatus: { linked: false } }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    const result = await getCurrentUser();

    expect(result.authenticated).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        credentials: "include",
        cache: "no-store"
      })
    );
  });

  it("logs out with cookie credentials enabled", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    await logout();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({
        method: "POST",
        credentials: "include"
      })
    );
  });
});

describe("immichPersonUrl", () => {
  it("builds a person page URL from Immich API base URL", () => {
    expect(immichPersonUrl("person-123", "http://localhost:2283/api")).toBe(
      "http://localhost:2283/people/person-123"
    );
  });

  it("supports base URLs that already omit /api", () => {
    expect(immichPersonUrl("person-abc", "http://localhost:2283")).toBe(
      "http://localhost:2283/people/person-abc"
    );
  });

  it("returns null when no base URL is available", () => {
    expect(immichPersonUrl("person-abc", undefined)).toBeNull();
    expect(immichPersonUrl("person-abc", null)).toBeNull();
    expect(immichPersonUrl("person-abc", "   ")).toBeNull();
  });
});

describe("computeGraphLayout", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws ApiHttpError with Zod issue path when the API returns validation details", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 400,
          error: "Validation Error",
          issues: [{ path: ["people", 0, "name"], message: "String must contain at least 1 character(s)" }]
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      )
    );

    await expect(
      computeGraphLayout({
        people: [{ id: "p1", name: "x" }],
        relationships: [],
        viewMode: "family"
      })
    ).rejects.toMatchObject({
      name: "ApiHttpError",
      statusCode: 400,
      message: expect.stringContaining("people.0.name")
    });
  });
});

describe("life-events API helpers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loads person life events and supports citations include query", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          lifeEvents: [{ id: "lev_1", eventType: "BIRTH", dateQualifier: "EXACT", citations: [] }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const events = await getPersonLifeEvents("person-1", { includeCitations: true });

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("lev_1");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/people/person-1/life-events?include=citations",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });

  it("loads person life event validation", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ findings: [{ code: "x", severity: "warning", message: "m" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const body = await getPersonLifeEventValidation("person-1");

    expect(body.findings).toHaveLength(1);
    expect(body.findings[0]?.code).toBe("x");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/people/person-1/life-events/validation",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });

  it("creates person life events with cookie credentials", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "lev_new",
          eventType: "DEATH",
          dateQualifier: "EXACT",
          citations: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    await createPersonLifeEvent("person-22", { eventType: "DEATH", year: 2020 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/people/person-22/life-events",
      expect.objectContaining({
        method: "POST",
        credentials: "include"
      })
    );
  });

  it("maps validation errors to ApiHttpError with status code", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 400,
          error: "month is required when day is set"
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" }
        }
      )
    );

    await expect(createPersonLifeEvent("person-22", { eventType: "DEATH", day: 12 })).rejects.toMatchObject({
      name: "ApiHttpError",
      statusCode: 400,
      message: "month is required when day is set"
    });
  });

  it("maps not found errors to ApiHttpError with status code", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 404,
          error: "Life event not found"
        }),
        {
          status: 404,
          headers: { "content-type": "application/json" }
        }
      )
    );

    await expect(deleteRelationshipLifeEvent("rel-1", "ev-404")).rejects.toMatchObject({
      name: "ApiHttpError",
      statusCode: 404,
      message: "Life event not found"
    });
  });

  it("maps conflict errors to ApiHttpError with status code", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 409,
          error: "A BIRTH event already exists for this person"
        }),
        {
          status: 409,
          headers: { "content-type": "application/json" }
        }
      )
    );

    let thrown: unknown;
    try {
      await createPersonLifeEvent("person-22", { eventType: "BIRTH", year: 1990 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiHttpError);
    expect(thrown).toMatchObject({
      statusCode: 409,
      message: "A BIRTH event already exists for this person"
    });
  });
});

describe("phase-2 API helpers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loads person timeline", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ timeline: [{ id: "e1", dateSortKey: 19800101 }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const response = await getPersonTimeline("p1");
    expect(response.timeline[0]?.id).toBe("e1");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/people/p1/timeline",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });

  it("loads research tasks with optional person scope", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ tasks: [{ id: "rt1", title: "Task", status: "OPEN" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const tasks = await getResearchTasks("p1");
    expect(tasks).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/tasks?personId=p1",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });

  it("creates research task with cookie credentials", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rt1", title: "Task", status: "OPEN" }), {
        status: 201,
        headers: { "content-type": "application/json" }
      })
    );
    await createResearchTask({ title: "Task", status: "OPEN", personId: null });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/research/tasks",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });

  it("loads geocoded places for map panel", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          mapUiEnabled: true,
          places: [{ id: "pl1", name: "Paris", samplePersonIds: ["p1"] }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    const body = await getPlacesMap({ includeLiving: true });
    expect(body.mapUiEnabled).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/places/map",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });

  it("passes includeLiving=false query for map feed", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ mapUiEnabled: true, places: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await getPlacesMap({ includeLiving: false });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/places/map?includeLiving=false",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });
});

describe("evidence API helpers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loads evidence repositories", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          repositories: [
            {
              id: "r1",
              name: "State Archive",
              addressLine1: null,
              url: null,
              notes: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const rows = await listEvidenceRepositories();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("State Archive");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/evidence/repositories",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("loads evidence sources with optional title filter query", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ sources: [{ id: "s1", title: "Census", repositoryId: null }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const rows = await listEvidenceSources("  census ");

    expect(rows).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/evidence/sources?q=census",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("posts merge sources with JSON body and session", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await mergeEvidenceSources({ fromSourceId: "s-from", intoSourceId: "s-into" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/evidence/sources/merge",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ fromSourceId: "s-from", intoSourceId: "s-into" }),
        credentials: "include"
      })
    );
  });

  it("creates a repository via POST", async () => {
    const row = {
      id: "r-new",
      name: "Archive",
      addressLine1: null,
      url: null,
      notes: null,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z"
    };
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(row), { status: 201, headers: { "content-type": "application/json" } })
    );

    const out = await createEvidenceRepository({
      name: "Archive",
      addressLine1: null,
      url: null,
      notes: null
    });

    expect(out.id).toBe("r-new");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/evidence/repositories",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("lists media objects from GET /evidence/media", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          mediaObjects: [
            {
              id: "m1",
              storageUrl: "https://example/doc.pdf",
              mimeType: "application/pdf",
              checksum: null,
              immichAssetId: null,
              title: "Will",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const list = await listEvidenceMediaObjects();
    expect(list).toHaveLength(1);
    expect(list[0]?.storageUrl).toBe("https://example/doc.pdf");
  });

  it("creates a media object via POST /evidence/media", async () => {
    const media = {
      id: "m2",
      storageUrl: "https://cdn/x.png",
      mimeType: "image/png",
      checksum: null,
      immichAssetId: null,
      title: "Photo",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(media), { status: 201, headers: { "content-type": "application/json" } })
    );

    const out = await createEvidenceMediaObject({
      storageUrl: "https://cdn/x.png",
      mimeType: "image/png",
      checksum: null,
      immichAssetId: null,
      title: "Photo"
    });

    expect(out.id).toBe("m2");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/evidence/media",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("loads target media links for families", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          links: [
            {
              id: "link-1",
              mediaObjectId: "m1",
              targetType: "FAMILY",
              targetId: "fam-1",
              notes: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              mediaObject: {
                id: "m1",
                storageUrl: "family.jpg",
                mimeType: "image/jpeg",
                checksum: null,
                immichAssetId: null,
                title: "Family",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z"
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const links = await getMediaLinksForTarget("FAMILY", "fam-1");
    expect(links[0]?.mediaObject.title).toBe("Family");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/evidence/media-links?targetType=FAMILY&targetId=fam-1",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("creates, lists, and deletes media links with session credentials", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "link-1", targetType: "FAMILY" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ links: [{ id: "link-1", targetType: "FAMILY" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await createEvidenceMediaLink("m1", { targetType: "FAMILY", targetId: "fam-1", notes: null });
    await listEvidenceMediaLinks("m1");
    await deleteEvidenceMediaLink("link-1");

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/evidence/media/m1/links",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/evidence/media/m1/links",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      "/api/evidence/media-links/link-1",
      expect.objectContaining({ method: "DELETE", credentials: "include" })
    );
  });
});

describe("validation findings API helpers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loads validation findings with repeated status filters", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ findings: [{ id: "vf1", status: "OPEN" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const findings = await getValidationFindings({ status: ["OPEN", "IN_PROGRESS"] });
    expect(findings).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/validation/findings?status=OPEN&status=IN_PROGRESS",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("recomputes and updates validation finding status via mutating routes", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ findings: [], summary: { current: 0 }, engineDisabled: false }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "vf1", status: "IN_PROGRESS" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    await recomputeValidationFindings();
    await updateValidationFinding("vf1", "IN_PROGRESS");

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/validation/recompute",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: "{}",
        headers: expect.objectContaining({ "Content-Type": "application/json" })
      })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/validation/findings/vf1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "IN_PROGRESS" }) })
    );
  });
});

describe("family API helpers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loads family life events with optional citations query", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ lifeEvents: [{ id: "e1", eventType: "CENSUS" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const events = await getFamilyLifeEvents("fam-1", { includeCitations: true });
    expect(events).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/families/fam-1/life-events?include=citations",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });

  it("loads family life events without citations query by default", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ lifeEvents: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await getFamilyLifeEvents("fam-2");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/families/fam-2/life-events",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });

  it("loads families for a person", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ families: [{ id: "f1", children: [] }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const rows = await getFamiliesForPerson("person%2F1");
    expect(rows).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/people/person%252F1/families",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });

  it("loads all families for report picker fallback", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ families: [{ id: "f1", children: [] }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const rows = await getFamilies();
    expect(rows).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/families",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });

  it("loads report JSON helpers with query parameters", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "pedigree",
            generatedAt: "2026-04-29T00:00:00.000Z",
            parameters: { rootPersonId: "p1", depth: 5, redactLiving: true },
            warnings: [],
            root: {
              id: "p1",
              displayName: "Living person",
              gender: "UNKNOWN",
              primaryName: null,
              alternateNames: [],
              isLiving: true,
              isRedacted: true,
              events: []
            },
            generations: [],
            edges: []
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "family-group",
            generatedAt: "2026-04-29T00:00:00.000Z",
            parameters: { familyId: "fam1", redactLiving: true },
            warnings: [],
            family: { id: "fam1", notes: null, parents: [], children: [], events: [], citations: [] }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    await fetchPedigreeReport("p1", { depth: 5, redactLiving: true });
    await fetchFamilyGroupSheetReport("fam1", { redactLiving: true });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/reports/pedigree?rootPersonId=p1&depth=5&redactLiving=true",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/reports/family-group?familyId=fam1&redactLiving=true",
      expect.objectContaining({ credentials: "include", cache: "no-store" })
    );
  });

  it("creates family union via POST", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "fam-new",
          userId: "u1",
          parent1PersonId: "a",
          parent2PersonId: "b",
          notes: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          children: []
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      )
    );

    const row = await createFamily({
      parent1PersonId: "a",
      parent2PersonId: "b",
      children: []
    });
    expect(row.id).toBe("fam-new");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/families",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });

  it("creates family life event with session", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "e-new",
          eventType: "RESIDENCE",
          dateQualifier: "EXACT",
          year: 1900,
          month: null,
          day: null,
          endYear: null,
          endMonth: null,
          endDay: null,
          notes: null,
          place: null,
          citations: [],
          familyId: "fam-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      )
    );

    const created = await createFamilyLifeEvent("fam-1", { eventType: "RESIDENCE", year: 1900 });
    expect(created.id).toBe("e-new");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/families/fam-1/life-events",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      })
    );
  });

  it("patches family with JSON body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "fam-1",
          userId: "u1",
          parent1PersonId: "p1",
          parent2PersonId: null,
          notes: "x",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          children: []
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const row = await patchFamily("fam-1", { notes: "x" });
    expect(row.notes).toBe("x");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/families/fam-1",
      expect.objectContaining({ method: "PATCH", credentials: "include" })
    );
  });

  it("deletes family", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await deleteFamily("fam-1");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/families/fam-1",
      expect.objectContaining({ method: "DELETE", credentials: "include" })
    );
  });

  it("updates family life event", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "ev-1",
          eventType: "CENSUS",
          dateQualifier: "EXACT",
          year: 1890,
          month: null,
          day: null,
          endYear: null,
          endMonth: null,
          endDay: null,
          notes: "US",
          place: null,
          citations: [],
          familyId: "fam-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const updated = await updateFamilyLifeEvent("fam-1", "ev-1", { notes: "US" });
    expect(updated.notes).toBe("US");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/families/fam-1/life-events/ev-1",
      expect.objectContaining({ method: "PATCH", credentials: "include" })
    );
  });

  it("deletes family life event", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await deleteFamilyLifeEvent("fam-1", "ev-9");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/families/fam-1/life-events/ev-9",
      expect.objectContaining({ method: "DELETE", credentials: "include" })
    );
  });
});

describe("people API helpers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("getPeople fetches from GET /people and returns the people array", async () => {
    const { getPeople } = await import("./api");
    const people = [{ id: "p1", name: "Alice" }];
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ people }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await getPeople();

    expect(result).toEqual(people);
    const [[url] = []] = vi.mocked(globalThis.fetch).mock.calls;
    expect(String(url)).toContain("/api/people");
  });

  it("getPeople passes search query as ?q= parameter", async () => {
    const { getPeople } = await import("./api");
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ people: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await getPeople("alice");

    const [[url] = []] = vi.mocked(globalThis.fetch).mock.calls;
    expect(String(url)).toContain("q=alice");
  });

  it("searchPeople calls GET /people with q, limit, and offset", async () => {
    const { searchPeople } = await import("./api");
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ people: [{ id: "p1", name: "A" }], nextOffset: 10 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await searchPeople({ query: "al", limit: 10, offset: 0 });

    expect(result.people).toEqual([{ id: "p1", name: "A" }]);
    expect(result.nextOffset).toBe(10);
    const [[url] = []] = vi.mocked(globalThis.fetch).mock.calls;
    const u = String(url);
    expect(u).toContain("/api/people");
    expect(u).toContain("q=al");
    expect(u).toContain("limit=10");
    expect(u).toContain("offset=0");
  });

  it("searchPeople maps missing nextOffset to null", async () => {
    const { searchPeople } = await import("./api");
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ people: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await searchPeople({ query: "x", limit: 10, offset: 0 });
    expect(result.nextOffset).toBeNull();
  });

  it("getPeople returns an empty array when the response omits the people key", async () => {
    const { getPeople } = await import("./api");
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } })
    );

    const result = await getPeople();
    expect(result).toEqual([]);
  });

  it("createPerson POSTs to /people and returns the created person", async () => {
    const { createPerson } = await import("./api");
    const created = { id: "p-new", name: "Bob Jones" };
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(created), {
        status: 201,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await createPerson({ givenName: "Bob", surname: "Jones" });

    expect(result).toEqual(created);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/people"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: expect.stringContaining("Bob")
      })
    );
  });

  it("createPerson throws ApiHttpError on non-OK response", async () => {
    const { createPerson, ApiHttpError } = await import("./api");
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Validation failed" }), {
        status: 422,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(createPerson({ givenName: "X" })).rejects.toBeInstanceOf(ApiHttpError);
  });

  it("links and unlinks person external identities", async () => {
    const { createPersonExternalIdentity, deletePersonExternalIdentity } = await import("./api");
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "identity-1", provider: "IMMICH", providerPersonId: "immich-1" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const created = await createPersonExternalIdentity("person-1", {
      provider: "IMMICH",
      providerPersonId: "immich-1"
    });
    await deletePersonExternalIdentity("person-1", "identity-1");

    expect(created.providerPersonId).toBe("immich-1");
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[0])).toContain(
      "/people/person-1/external-identities"
    );
    expect(String(vi.mocked(globalThis.fetch).mock.calls[1]?.[0])).toContain(
      "/people/person-1/external-identities/identity-1"
    );
  });

  it("uploads and imports person thumbnails", async () => {
    const { uploadPersonThumbnail, importPersonImmichThumbnail } = await import("./api");
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "thumb-1", source: "UPLOADED" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "thumb-2", source: "IMMICH" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
      );

    const uploaded = await uploadPersonThumbnail(
      "person-1",
      new File(["portrait"], "portrait.jpg", { type: "image/jpeg" })
    );
    const imported = await importPersonImmichThumbnail("person-1");

    expect(uploaded.source).toBe("UPLOADED");
    expect(imported.source).toBe("IMMICH");
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[0])).toContain(
      "/people/person-1/thumbnail/upload"
    );
    expect(String(vi.mocked(globalThis.fetch).mock.calls[1]?.[0])).toContain(
      "/people/person-1/thumbnail/import/immich"
    );
  });

  it("deletePerson sends DELETE /people/:id", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await deletePerson("pp-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/people/pp-1"),
      expect.objectContaining({ method: "DELETE", credentials: "include" })
    );
  });

  it("deletePerson throws ApiHttpError on non-OK response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Person not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(deletePerson("missing")).rejects.toBeInstanceOf(ApiHttpError);
  });

  it("loads duplicate candidates with filters", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [{ id: "dup-1", status: "PENDING" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const candidates = await getDuplicateCandidates({ status: "PENDING", limit: 25 });

    expect(candidates).toEqual([{ id: "dup-1", status: "PENDING" }]);
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[0])).toContain(
      "/api/people/duplicates?status=PENDING&limit=25"
    );
  });

  it("posts duplicate recompute, status update, and merge requests", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [],
            summary: { created: 1, updated: 0, preservedDismissed: 0, pending: 1 }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "dup-1", status: "DISMISSED" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ auditId: "audit-1", canonicalPersonId: "p1", duplicatePersonId: "p2" }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );

    await recomputeDuplicateCandidates();
    await updateDuplicateCandidate("dup-1", { status: "DISMISSED" });
    await mergeDuplicateCandidate("dup-1", {
      canonicalPersonId: "p1",
      duplicatePersonId: "p2",
      confirm: true
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/people/duplicates/recompute",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: "{}",
        headers: expect.objectContaining({ "Content-Type": "application/json" })
      })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/people/duplicates/dup-1",
      expect.objectContaining({ method: "PATCH", credentials: "include" })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      "/api/people/duplicates/dup-1/merge",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });
});
