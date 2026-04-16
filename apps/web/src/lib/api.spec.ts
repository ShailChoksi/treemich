import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser, immichPersonUrl, login, logout } from "./api";

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
