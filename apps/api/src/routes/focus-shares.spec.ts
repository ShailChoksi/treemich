import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { AppServices } from "../services.js";
import { HttpNotFoundError } from "../lifeEvents/errors.js";

const mocks = vi.hoisted(() => ({
  treemichSessionFindUnique: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  rotatePassword: vi.fn(),
  revoke: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
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
  },
  isCookieSecure: () => false
}));

vi.mock("../integrations/immich/client.js", () => ({
  ImmichAuthenticationError: class ImmichAuthenticationError extends Error {
    readonly statusCode = 401;
  },
  loginToImmich: vi.fn()
}));

const makeUser = () => ({
  id: "user-1",
  email: "owner@treemich.local",
  name: "Owner",
  passwordHash: null,
  isAdmin: false,
  passwordChangeRequired: false,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z")
});

const shareRecord = {
  id: "share-1",
  publicId: "pub-1",
  publicPath: "/share/pub-1",
  label: "Reunion",
  focusAnchorPersonId: "person-1",
  maxAncestorDepth: 3,
  maxDescendantDepth: 3,
  maxCollateralDepth: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const buildTestApp = async () => {
  const { AuthService, TreemichAuthError } = await import("../auth/service.js");
  const { readCookie } = await import("../auth/request.js");
  const { registerFocusShareRoutes } = await import("./focus-shares.js");

  const authService = new AuthService();
  const focusShareService = {
    list: mocks.list,
    create: mocks.create,
    update: mocks.update,
    rotatePassword: mocks.rotatePassword,
    revoke: mocks.revoke
  };

  const app = Fastify();
  app.decorateRequest("auth", null);
  app.decorate("services", { authService, focusShareService } as unknown as AppServices);

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError || (error instanceof Error && error.name === "ZodError")) {
      return reply.code(400).send({ statusCode: 400, error: "Validation Error" });
    }
    if (error instanceof TreemichAuthError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error instanceof HttpNotFoundError) {
      return reply.code(404).send({ statusCode: 404, error: error.message });
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
  await app.register(registerFocusShareRoutes);
  return app;
};

describe("Focus Share owner routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const user = makeUser();
    mocks.treemichSessionFindUnique.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenHash: "hash",
      expiresAt: new Date(Date.now() + 60_000),
      user
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /focus-shares returns the owner's list", async () => {
    mocks.list.mockResolvedValue([shareRecord]);
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/focus-shares",
      headers: { cookie: "treemich_session=token" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ shares: [shareRecord] });
    expect(mocks.list).toHaveBeenCalledWith("user-1");
    await app.close();
  });

  it("POST /focus-shares creates a share", async () => {
    mocks.create.mockResolvedValue(shareRecord);
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/focus-shares",
      headers: { cookie: "treemich_session=token", "content-type": "application/json" },
      payload: {
        password: "share-pass!",
        focusAnchorPersonId: "person-1",
        maxAncestorDepth: 3,
        maxDescendantDepth: 3,
        maxCollateralDepth: 0,
        label: "Reunion"
      }
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(shareRecord);
    expect(mocks.create).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        password: "share-pass!",
        focusAnchorPersonId: "person-1"
      })
    );
    await app.close();
  });

  it("rejects create with short password", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/focus-shares",
      headers: { cookie: "treemich_session=token", "content-type": "application/json" },
      payload: {
        password: "short",
        focusAnchorPersonId: "person-1",
        maxAncestorDepth: 3,
        maxDescendantDepth: 3,
        maxCollateralDepth: 0
      }
    });
    expect(response.statusCode).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("DELETE /focus-shares/:shareId revokes", async () => {
    mocks.revoke.mockResolvedValue(undefined);
    const app = await buildTestApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/focus-shares/share-1",
      headers: { cookie: "treemich_session=token" }
    });
    expect(response.statusCode).toBe(204);
    expect(mocks.revoke).toHaveBeenCalledWith("user-1", "share-1");
    await app.close();
  });

  it("returns 404 when rotate targets a missing share", async () => {
    mocks.rotatePassword.mockRejectedValue(new HttpNotFoundError("Focus share not found"));
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/focus-shares/share-missing/rotate-password",
      headers: { cookie: "treemich_session=token", "content-type": "application/json" },
      payload: { password: "new-password" }
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
