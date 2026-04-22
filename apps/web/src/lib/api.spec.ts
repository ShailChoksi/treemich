import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiHttpError,
  createPersonLifeEvent,
  deleteRelationshipLifeEvent,
  getCurrentUser,
  getPersonLifeEventValidation,
  getPersonLifeEvents,
  immichPersonUrl,
  login,
  logout
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
