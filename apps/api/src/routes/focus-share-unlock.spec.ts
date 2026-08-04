import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { AppServices } from "../services.js";
import { HttpNotFoundError } from "../lifeEvents/errors.js";
import { TreemichAuthError } from "../auth/service.js";

const mocks = vi.hoisted(() => ({
  unlock: vi.fn()
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

const buildTestApp = async () => {
  const { registerFocusShareUnlockRoute } = await import("./focus-share-unlock.js");
  const focusShareService = { unlock: mocks.unlock };
  const app = Fastify();
  app.decorate("services", { focusShareService } as unknown as AppServices);

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

  await app.register(registerFocusShareUnlockRoute);
  return app;
};

describe("POST /share/:publicId/unlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets the guest cookie and returns share caps", async () => {
    mocks.unlock.mockResolvedValue({
      sessionToken: "guest-token-xyz",
      response: {
        share: {
          publicId: "pub-1",
          label: "Reunion",
          focusAnchorPersonId: "person-1",
          maxAncestorDepth: 3,
          maxDescendantDepth: 3,
          maxCollateralDepth: 0
        },
        expiresAt: "2026-01-01T04:00:00.000Z"
      }
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/share/pub-1/unlock",
      headers: { "content-type": "application/json" },
      payload: { password: "share-pass!" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().share.publicId).toBe("pub-1");
    expect(response.headers["set-cookie"]).toContain("treemich_share_session=");
    expect(response.headers["set-cookie"]).toContain("guest-token-xyz");
    expect(mocks.unlock).toHaveBeenCalledWith("pub-1", "share-pass!");
    await app.close();
  });

  it("returns 404 for unknown shares and 401 for bad passwords", async () => {
    mocks.unlock.mockRejectedValueOnce(new HttpNotFoundError("Focus share not found"));
    const app = await buildTestApp();
    const missing = await app.inject({
      method: "POST",
      url: "/share/missing/unlock",
      headers: { "content-type": "application/json" },
      payload: { password: "share-pass!" }
    });
    expect(missing.statusCode).toBe(404);

    mocks.unlock.mockRejectedValueOnce(new TreemichAuthError("Invalid share password"));
    const bad = await app.inject({
      method: "POST",
      url: "/share/pub-1/unlock",
      headers: { "content-type": "application/json" },
      payload: { password: "wrong-password" }
    });
    expect(bad.statusCode).toBe(401);
    await app.close();
  });
});
