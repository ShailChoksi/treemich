/**
 * @packageDocumentation
 * Unit tests for session cookie helpers and auth request utilities.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isCookieSecure: vi.fn()
}));

vi.mock("../config/env.js", () => ({
  env: {
    TREEMICH_SESSION_COOKIE_NAME: "treemich_session",
    TREEMICH_SESSION_TTL_MS: 2_592_000_000
  },
  isCookieSecure: mocks.isCookieSecure
}));

const makeReply = (): FastifyReply =>
  ({
    header: vi.fn()
  }) as unknown as FastifyReply;

const makeRequest = (cookieHeader?: string): FastifyRequest =>
  ({
    headers: { cookie: cookieHeader },
    auth: null
  }) as unknown as FastifyRequest;

describe("setSessionCookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCookieSecure.mockReturnValue(false);
  });

  it("sets a cookie without Secure when isCookieSecure returns false", async () => {
    const { setSessionCookie } = await import("./request.js");
    const reply = makeReply();

    setSessionCookie(reply, "test-token");

    expect(reply.header).toHaveBeenCalledWith(
      "Set-Cookie",
      "treemich_session=test-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"
    );
  });

  it("includes Secure when isCookieSecure returns true", async () => {
    mocks.isCookieSecure.mockReturnValue(true);
    const { setSessionCookie } = await import("./request.js");
    const reply = makeReply();

    setSessionCookie(reply, "test-token");

    expect(reply.header).toHaveBeenCalledWith(
      "Set-Cookie",
      "treemich_session=test-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure"
    );
  });

  it("URL-encodes the token value", async () => {
    const { setSessionCookie } = await import("./request.js");
    const reply = makeReply();

    setSessionCookie(reply, "token+with/special chars");

    expect(reply.header).toHaveBeenCalledWith(
      "Set-Cookie",
      expect.stringContaining("treemich_session=token%2Bwith%2Fspecial%20chars")
    );
  });
});

describe("clearSessionCookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCookieSecure.mockReturnValue(false);
  });

  it("clears the cookie without Secure", async () => {
    const { clearSessionCookie } = await import("./request.js");
    const reply = makeReply();

    clearSessionCookie(reply);

    expect(reply.header).toHaveBeenCalledWith(
      "Set-Cookie",
      "treemich_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    );
  });

  it("includes Secure when isCookieSecure returns true", async () => {
    mocks.isCookieSecure.mockReturnValue(true);
    const { clearSessionCookie } = await import("./request.js");
    const reply = makeReply();

    clearSessionCookie(reply);

    expect(reply.header).toHaveBeenCalledWith(
      "Set-Cookie",
      "treemich_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure"
    );
  });
});

describe("readCookie", () => {
  it("returns null when no cookie header is present", async () => {
    const { readCookie } = await import("./request.js");
    expect(readCookie(makeRequest())).toBeNull();
  });

  it("returns the session token from the cookie header", async () => {
    const { readCookie } = await import("./request.js");
    const request = makeRequest("other_cookie=123; treemich_session=my-token");
    expect(readCookie(request)).toBe("my-token");
  });

  it("returns null when the session cookie is not found", async () => {
    const { readCookie } = await import("./request.js");
    const request = makeRequest("other_cookie=123");
    expect(readCookie(request)).toBeNull();
  });

  it("URL-decodes the token", async () => {
    const { readCookie } = await import("./request.js");
    const request = makeRequest("treemich_session=token%2Bencoded");
    expect(readCookie(request)).toBe("token+encoded");
  });

  it("handles empty cookie header gracefully", async () => {
    const { readCookie } = await import("./request.js");
    const request = makeRequest("");
    expect(readCookie(request)).toBeNull();
  });

  it("accepts a custom cookie name", async () => {
    const { readCookie } = await import("./request.js");
    const request = makeRequest("my_session=abc; treemich_session=ignored");
    expect(readCookie(request, "my_session")).toBe("abc");
  });
});

describe("getRequiredAuth", () => {
  it("returns request.auth when present", async () => {
    const { getRequiredAuth } = await import("./request.js");
    const authContext = { user: { id: "u1" }, session: { id: "s1" } };
    const request = makeRequest();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any).auth = authContext;

    expect(getRequiredAuth(request)).toBe(authContext);
  });

  it("throws Unauthorized when request.auth is null", async () => {
    const { getRequiredAuth } = await import("./request.js");
    const request = makeRequest();

    expect(() => getRequiredAuth(request)).toThrow("Unauthorized");
  });
});
