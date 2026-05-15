import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../services.js";

const mocks = vi.hoisted(() => ({
  treemichUserFindMany: vi.fn(),
  treemichUserCount: vi.fn(),
  treemichUserCreate: vi.fn(),
  treemichUserUpdate: vi.fn(),
  treemichSessionCreate: vi.fn(),
  treemichSessionFindUnique: vi.fn(),
  treemichSessionDelete: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    treemichUser: {
      findMany: mocks.treemichUserFindMany,
      count: mocks.treemichUserCount,
      create: mocks.treemichUserCreate,
      update: mocks.treemichUserUpdate
    },
    treemichSession: {
      create: mocks.treemichSessionCreate,
      findUnique: mocks.treemichSessionFindUnique,
      delete: mocks.treemichSessionDelete
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
    IMMICH_HTTP_TIMEOUT_MS: 5000
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
  _count: { profiles: 0 },
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
  ...overrides
});

describe("Treemich login to people route integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs into the populated duplicate account and returns that user's people", async () => {
    const { hashPassword } = await import("../auth/crypto.js");
    const { AuthService, TreemichAuthError } = await import("../auth/service.js");
    const { readCookie } = await import("../auth/request.js");
    const { registerAuthLoginRoute } = await import("./auth.login.js");
    const { registerPeopleGetRoute } = await import("./people.get.js");

    const oldDuplicate = makeUser({
      id: "user-old",
      passwordHash: hashPassword("correctpass"),
      _count: { profiles: 253 },
      updatedAt: new Date("2025-01-01T00:00:00.000Z")
    });
    const primaryAccount = makeUser({
      id: "user-primary",
      passwordHash: hashPassword("correctpass"),
      _count: { profiles: 646 },
      updatedAt: new Date("2025-01-02T00:00:00.000Z")
    });
    mocks.treemichUserFindMany.mockResolvedValue([oldDuplicate, primaryAccount]);
    mocks.treemichUserCount.mockResolvedValue(2);
    mocks.treemichSessionCreate.mockResolvedValue({ id: "session-1" });
    mocks.treemichSessionFindUnique.mockImplementation(
      async ({ where }: { where: { tokenHash: string } }) => ({
        id: "session-1",
        userId: "user-primary",
        tokenHash: where.tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        user: primaryAccount
      })
    );

    const peopleForPrimary = [{ id: "person-primary", name: "Primary Person", hasRelationship: true }];
    const peopleForOld = [{ id: "person-old", name: "Old Person", hasRelationship: true }];
    const personService = {
      list: vi.fn(async (userId: string) => (userId === "user-primary" ? peopleForPrimary : peopleForOld))
    };
    const relationshipService = {
      getConnectedPersonIds: vi.fn(async (_userId: string, personIds: string[]) => new Set(personIds))
    };
    const authService = new AuthService();
    const app = Fastify({ trustProxy: false });
    app.decorateRequest("auth", null);
    app.decorate("services", {
      authService,
      personService,
      relationshipService
    } as unknown as AppServices);

    await app.register(rateLimit, { max: 300, timeWindow: 60_000 });

    app.addHook("preHandler", async (request, reply) => {
      if (request.routeOptions.url === "/auth/login") {
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

    await app.register(registerAuthLoginRoute);
    registerPeopleGetRoute(app);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "alice@example.com", password: "correctpass", provider: "treemich" }
    });
    const setCookie = loginResponse.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    const peopleResponse = await app.inject({
      method: "GET",
      url: "/people",
      headers: { cookie: cookie ?? "" }
    });

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.json().user.id).toBe("user-primary");
    expect(mocks.treemichSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-primary" })
      })
    );
    expect(peopleResponse.statusCode).toBe(200);
    expect(peopleResponse.json().people).toEqual(peopleForPrimary);
    expect(personService.list).toHaveBeenCalledWith("user-primary", undefined);

    await app.close();
  });
});
