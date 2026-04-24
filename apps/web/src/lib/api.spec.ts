import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiHttpError,
  createFamily,
  createFamilyLifeEvent,
  createResearchTask,
  createPersonLifeEvent,
  deleteFamily,
  deleteFamilyLifeEvent,
  getFamiliesForPerson,
  getFamilyLifeEvents,
  getPlacesMap,
  getPersonTimeline,
  getResearchTasks,
  deleteRelationshipLifeEvent,
  getCurrentUser,
  getPersonLifeEventValidation,
  getPersonLifeEvents,
  immichPersonUrl,
  login,
  logout,
  patchFamily,
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
    await createResearchTask({ title: "Task", status: "OPEN", immichPersonId: null });
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

  it("creates family union via POST", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "fam-new",
          userId: "u1",
          parent1ImmichPersonId: "a",
          parent2ImmichPersonId: "b",
          notes: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          children: []
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      )
    );

    const row = await createFamily({
      parent1ImmichPersonId: "a",
      parent2ImmichPersonId: "b",
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
        { status: 200, headers: { "content-type": "application/json" } }
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
          parent1ImmichPersonId: "p1",
          parent2ImmichPersonId: null,
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
