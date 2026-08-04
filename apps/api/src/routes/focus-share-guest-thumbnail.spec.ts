import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { AppServices } from "../services.js";
import { TreemichAuthError } from "../auth/service.js";
import { HttpNotFoundError } from "../lifeEvents/errors.js";

const mocks = vi.hoisted(() => ({
  requireGuestPersonInMembership: vi.fn(),
  openStoredMediaReadStream: vi.fn(),
  storageKeyFromUrl: vi.fn()
}));

vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    TREEMICH_SHARE_SESSION_COOKIE_NAME: "treemich_share_session",
    TREEMICH_SHARE_SESSION_TTL_MS: 4 * 60 * 60 * 1000,
    TREEMICH_COOKIE_SECURE: "false"
  },
  isCookieSecure: () => false
}));

vi.mock("../evidence/mediaStorage.js", () => ({
  openStoredMediaReadStream: (...args: unknown[]) => mocks.openStoredMediaReadStream(...args),
  storageKeyFromUrl: (...args: unknown[]) => mocks.storageKeyFromUrl(...args)
}));

vi.mock("../db/client.js", () => ({
  prisma: {}
}));

const buildTestApp = async () => {
  const { registerFocusShareGuestThumbnailRoute } = await import("./focus-share-guest-thumbnail.js");
  const app = Fastify();
  app.decorate("services", {
    focusShareService: {
      requireGuestPersonInMembership: mocks.requireGuestPersonInMembership
    }
  } as unknown as AppServices);

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError || (error instanceof Error && error.name === "ZodError")) {
      return reply.code(400).send({ statusCode: 400, error: "Validation Error" });
    }
    if (error instanceof TreemichAuthError) {
      return reply.code(error.statusCode).send({ statusCode: error.statusCode, error: error.message });
    }
    if (error instanceof HttpNotFoundError) {
      return reply.code(404).send({ statusCode: 404, error: error.message });
    }
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  await app.register(registerFocusShareGuestThumbnailRoute);
  return app;
};

describe("GET /share/guest/people/:personId/thumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns SVG initials when no stored thumbnail exists", async () => {
    mocks.requireGuestPersonInMembership.mockResolvedValue({
      guest: { share: { userId: "user-1" } },
      person: {
        id: "p1",
        givenName: "Ada",
        surname: "Lovelace",
        displayNameOverride: null,
        externalIdentities: [],
        thumbnails: []
      }
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/share/guest/people/p1/thumbnail",
      headers: { cookie: "treemich_share_session=guest-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/svg+xml");
    expect(response.headers["cache-control"]).toContain("private");
    expect(String(response.body)).toContain("AL");
    expect(mocks.requireGuestPersonInMembership).toHaveBeenCalledWith("guest-token", "p1");
    await app.close();
  });

  it("rejects unauthorized guests", async () => {
    mocks.requireGuestPersonInMembership.mockRejectedValue(new TreemichAuthError("Unauthorized"));
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/share/guest/people/p1/thumbnail"
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
