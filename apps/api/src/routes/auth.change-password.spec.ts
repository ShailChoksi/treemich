import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { AppServices } from "../services.js";

const mocks = vi.hoisted(() => ({
  treemichUserFindUnique: vi.fn(),
  treemichUserUpdate: vi.fn(),
  treemichSessionFindUnique: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    treemichUser: {
      findUnique: mocks.treemichUserFindUnique,
      update: mocks.treemichUserUpdate
    },
    treemichSession: {
      findUnique: mocks.treemichSessionFindUnique
    }
  }
}));

vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    TREEMICH_SESSION_COOKIE_NAME: "treemich_session",
    TREEMICH_SESSION_TTL_MS: 2_592_000_000,
    TREEMICH_ENCRYPTION_KEY: "a".repeat(64),
    TREEMICH_ADMIN_PASSWORD: "treemich-pass!"
  }
}));

vi.mock("../integrations/immich/client.js", () => ({
  ImmichAuthenticationError: class ImmichAuthenticationError extends Error {
    readonly statusCode = 401;
  },
  loginToImmich: vi.fn()
}));

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  email: "admin@treemich.local",
  name: "Admin",
  passwordHash: null,
  isAdmin: true,
  passwordChangeRequired: true,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
  ...overrides
});

const buildTestApp = async () => {
  const { AuthService, TreemichAuthError } = await import("../auth/service.js");
  const { readCookie } = await import("../auth/request.js");
  const { registerAuthChangePasswordRoute } = await import("./auth.change-password.js");

  const authService = new AuthService();
  const app = Fastify();
  app.decorateRequest("auth", null);
  app.decorate("services", { authService } as unknown as AppServices);

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError || (error instanceof Error && error.name === "ZodError")) {
      return reply.code(400).send({ statusCode: 400, error: "Validation Error" });
    }
    if (error instanceof TreemichAuthError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  app.addHook("preHandler", async (request, reply) => {
    try {
      request.auth = await authService.requireSession(readCookie(request));
    } catch (error) {
      if (error instanceof TreemichAuthError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });
  await app.register(registerAuthChangePasswordRoute);
  return app;
};

const makeSessionFor = (user: ReturnType<typeof makeUser>) => ({
  id: "session-1",
  userId: user.id,
  tokenHash: "hash",
  expiresAt: new Date(Date.now() + 60_000),
  user
});

describe("POST /auth/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 and updates password when current password is correct", async () => {
    const { hashPassword } = await import("../auth/crypto.js");
    const user = makeUser({ passwordHash: hashPassword("treemich-pass!") });
    mocks.treemichSessionFindUnique.mockImplementation(
      async ({ where }: { where: { tokenHash: string } }) => ({
        ...makeSessionFor(user),
        tokenHash: where.tokenHash
      })
    );
    mocks.treemichUserFindUnique.mockResolvedValue(user);
    mocks.treemichUserUpdate.mockResolvedValue({
      ...user,
      passwordHash: "new-hash",
      passwordChangeRequired: false
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      headers: { cookie: "treemich_session=fake-token" },
      payload: { currentPassword: "treemich-pass!", newPassword: "new-secure-pass" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(mocks.treemichUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ passwordChangeRequired: false })
      })
    );
    await app.close();
  });

  it("returns 401 when current password is wrong", async () => {
    const { hashPassword } = await import("../auth/crypto.js");
    const user = makeUser({ passwordHash: hashPassword("correct-pass") });
    mocks.treemichSessionFindUnique.mockImplementation(
      async ({ where }: { where: { tokenHash: string } }) => ({
        ...makeSessionFor(user),
        tokenHash: where.tokenHash
      })
    );
    mocks.treemichUserFindUnique.mockResolvedValue(user);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      headers: { cookie: "treemich_session=fake-token" },
      payload: { currentPassword: "wrong-pass", newPassword: "new-secure-pass" }
    });

    expect(response.statusCode).toBe(401);
    expect(mocks.treemichUserUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 401 when request is unauthenticated", async () => {
    mocks.treemichSessionFindUnique.mockResolvedValue(null);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      payload: { currentPassword: "pass", newPassword: "new-secure-pass" }
    });

    expect(response.statusCode).toBe(401);
    expect(mocks.treemichUserFindUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 400 when newPassword is shorter than 8 characters", async () => {
    const { hashPassword } = await import("../auth/crypto.js");
    const user = makeUser({ passwordHash: hashPassword("old-pass") });
    mocks.treemichSessionFindUnique.mockImplementation(
      async ({ where }: { where: { tokenHash: string } }) => ({
        ...makeSessionFor(user),
        tokenHash: where.tokenHash
      })
    );

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      headers: { cookie: "treemich_session=fake-token" },
      payload: { currentPassword: "old-pass", newPassword: "short" }
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.treemichUserUpdate).not.toHaveBeenCalled();
    await app.close();
  });
});
