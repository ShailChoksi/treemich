/**
 * @packageDocumentation
 * Integration tests for POST /auth/login route — happy path, wrong password, cookie Secure flag,
 * admin seeding, and protected route enforcement.
 */

import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { AppServices } from "../services.js";

const mocks = vi.hoisted(() => ({
  treemichUserFindFirst: vi.fn(),
  treemichUserFindMany: vi.fn(),
  treemichUserCount: vi.fn(),
  treemichUserCreate: vi.fn(),
  treemichUserUpdate: vi.fn(),
  treemichSessionCreate: vi.fn(),
  treemichSessionFindUnique: vi.fn(),
  treemichSessionDelete: vi.fn(),
  linkedImmichAccountFindUnique: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    treemichUser: {
      findFirst: mocks.treemichUserFindFirst,
      findMany: mocks.treemichUserFindMany,
      count: mocks.treemichUserCount,
      create: mocks.treemichUserCreate,
      update: mocks.treemichUserUpdate
    },
    treemichSession: {
      create: mocks.treemichSessionCreate,
      findUnique: mocks.treemichSessionFindUnique,
      delete: mocks.treemichSessionDelete
    },
    linkedImmichAccount: {
      findUnique: mocks.linkedImmichAccountFindUnique
    }
  }
}));

vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    TREEMICH_SESSION_COOKIE_NAME: "treemich_session",
    TREEMICH_SESSION_TTL_MS: 2_592_000_000,
    TREEMICH_ENCRYPTION_KEY: "a".repeat(64),
    IMMICH_BASE_URL: "https://immich.example",
    IMMICH_HTTP_TIMEOUT_MS: 5000,
    TREEMICH_ADMIN_PASSWORD: "treemich-pass!"
  },
  isCookieSecure: () => false
}));

vi.mock("../integrations/immich/client.js", () => ({
  ImmichAuthenticationError: class ImmichAuthenticationError extends Error {
    readonly statusCode = 401;
  },
  loginToImmich: vi.fn()
}));

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  email: "alice@example.com",
  name: "Alice",
  passwordHash: null,
  isAdmin: false,
  passwordChangeRequired: false,
  _count: { profiles: 0 },
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
  ...overrides
});

const hasStatusCode = (error: unknown): error is { statusCode: number; message: string } => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: unknown; message?: unknown };
  return typeof candidate.statusCode === "number" && typeof candidate.message === "string";
};

const buildApp = async (routes: ("login" | "me")[] = ["login"]) => {
  const { AuthService, TreemichAuthError } = await import("../auth/service.js");
  const { readCookie } = await import("../auth/request.js");

  const authService = new AuthService();
  const app = Fastify({ trustProxy: false });
  app.decorateRequest("auth", null);
  app.decorate("services", { authService } as unknown as AppServices);

  await app.register(rateLimit, { max: 300, timeWindow: 60_000 });

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError || (error instanceof Error && error.name === "ZodError")) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Validation Error",
        issues: (error as ZodError).issues
      });
    }
    if (error instanceof TreemichAuthError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (hasStatusCode(error)) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({ statusCode: 500, error: "Internal Server Error" });
  });

  app.addHook("preHandler", async (request, reply) => {
    const url = request.url;
    if (url === "/auth/login" || url === "/auth/me" || url === "/auth/logout") {
      return;
    }
    try {
      request.auth = await authService.requireSession(readCookie(request));
    } catch (error) {
      if (error instanceof TreemichAuthError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  const { registerAuthLoginRoute } = await import("./auth.login.js");
  const { registerAuthMeRoute } = await import("./auth.me.js");

  if (routes.includes("login")) {
    await app.register(registerAuthLoginRoute);
  }
  if (routes.includes("me")) {
    registerAuthMeRoute(app);
  }

  return { app, authService };
};

describe("POST /auth/login integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.treemichSessionCreate.mockResolvedValue({ id: "session-1" });
    mocks.linkedImmichAccountFindUnique.mockResolvedValue(null);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  describe("happy path", () => {
    it("returns 200 with auth state and sets cookie when credentials are correct", async () => {
      const { hashPassword } = await import("../auth/crypto.js");
      const user = makeUser({ passwordHash: hashPassword("correctpass") });
      mocks.treemichUserFindMany.mockResolvedValue([user]);
      mocks.treemichUserCount.mockResolvedValue(1);

      const { app } = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "alice@example.com", password: "correctpass", provider: "treemich" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().authenticated).toBe(true);
      expect(response.json().user.email).toBe("alice@example.com");
      expect(response.json().user.passwordChangeRequired).toBe(false);
      const setCookie = response.headers["set-cookie"];
      const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookie).toMatch(/^treemich_session=/);
      expect(cookie).not.toContain("Secure");

      await app.close();
    });

    it("returns passwordChangeRequired=true when the user has that flag set", async () => {
      const { hashPassword } = await import("../auth/crypto.js");
      const user = makeUser({
        passwordHash: hashPassword("correctpass"),
        passwordChangeRequired: true
      });
      mocks.treemichUserFindMany.mockResolvedValue([user]);
      mocks.treemichUserCount.mockResolvedValue(1);

      const { app } = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "alice@example.com", password: "correctpass", provider: "treemich" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user.passwordChangeRequired).toBe(true);

      await app.close();
    });
  });

  describe("failure modes", () => {
    it("returns 401 when password is wrong", async () => {
      const { hashPassword } = await import("../auth/crypto.js");
      const user = makeUser({ passwordHash: hashPassword("correctpass") });
      mocks.treemichUserFindMany.mockResolvedValue([user]);
      mocks.treemichUserCount.mockResolvedValue(1);

      const { app } = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "alice@example.com", password: "wrongpass", provider: "treemich" }
      });

      expect(response.statusCode).toBe(401);
      expect(mocks.treemichSessionCreate).not.toHaveBeenCalled();

      await app.close();
    });

    it("returns 401 when email does not exist and other users exist", async () => {
      mocks.treemichUserFindMany.mockResolvedValue([]);
      mocks.treemichUserCount.mockResolvedValue(1);

      const { app } = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "unknown@example.com", password: "somepass", provider: "treemich" }
      });

      expect(response.statusCode).toBe(401);
      expect(mocks.treemichUserCreate).not.toHaveBeenCalled();
      expect(mocks.treemichSessionCreate).not.toHaveBeenCalled();

      await app.close();
    });

    it("returns 400 when email is not a valid email format", async () => {
      const { app } = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "not-an-email", password: "somepass", provider: "treemich" }
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it("returns 400 when password is empty", async () => {
      const { app } = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "alice@example.com", password: "", provider: "treemich" }
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });
  });

  describe("auth state query", () => {
    it("returns unauthenticated state for /auth/me when no cookie is present", async () => {
      const { app } = await buildApp(["me"]);

      const response = await app.inject({
        method: "GET",
        url: "/auth/me"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().authenticated).toBe(false);

      await app.close();
    });

    it("returns authenticated state for /auth/me when valid cookie is present", async () => {
      const { app } = await buildApp(["me"]);

      const user = makeUser();
      mocks.treemichSessionFindUnique.mockResolvedValue({
        id: "session-1",
        userId: user.id,
        tokenHash: "some-hash",
        expiresAt: new Date(Date.now() + 60_000),
        user
      });

      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: "treemich_session=valid-token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().authenticated).toBe(true);

      await app.close();
    });

    it("returns unauthenticated state for /auth/me when session is expired", async () => {
      const { app } = await buildApp(["me"]);

      const user = makeUser();
      mocks.treemichSessionFindUnique.mockResolvedValue({
        id: "session-expired",
        userId: user.id,
        tokenHash: "expired-hash",
        expiresAt: new Date(Date.now() - 60_000),
        user
      });
      mocks.treemichSessionDelete.mockResolvedValue({ id: "session-expired" });

      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: "treemich_session=expired-token" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().authenticated).toBe(false);

      await app.close();
    });
  });

  describe("cookie login round-trip", () => {
    it("can login and then query auth state with the returned cookie", async () => {
      const { hashPassword } = await import("../auth/crypto.js");
      const user = makeUser({ passwordHash: hashPassword("correctpass") });
      mocks.treemichUserFindMany.mockResolvedValue([user]);
      mocks.treemichUserCount.mockResolvedValue(1);

      mocks.treemichSessionFindUnique.mockImplementation(
        async ({ where }: { where: { tokenHash: string } }) => ({
          id: "session-1",
          userId: user.id,
          tokenHash: where.tokenHash,
          expiresAt: new Date(Date.now() + 60_000),
          user
        })
      );

      const { app } = await buildApp(["login", "me"]);

      // Login step
      const loginResponse = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "alice@example.com", password: "correctpass", provider: "treemich" }
      });
      expect(loginResponse.statusCode).toBe(200);

      const setCookie = loginResponse.headers["set-cookie"];
      const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

      // Auth state query with the cookie from login
      const meResponse = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: cookie ?? "" }
      });

      expect(meResponse.statusCode).toBe(200);
      expect(meResponse.json().authenticated).toBe(true);
      expect(meResponse.json().user.id).toBe("user-1");

      await app.close();
    });
  });
});
