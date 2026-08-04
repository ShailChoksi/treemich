import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { AppServices } from "../services.js";
import { TreemichAuthError } from "../auth/service.js";

const mocks = vi.hoisted(() => ({
  getGuestGraph: vi.fn()
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
  const { registerFocusShareGuestGraphRoute } = await import("./focus-share-guest-graph.js");
  const app = Fastify();
  app.decorate("services", {
    focusShareService: { getGuestGraph: mocks.getGuestGraph }
  } as unknown as AppServices);

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError || (error instanceof Error && error.name === "ZodError")) {
      return reply.code(400).send({ statusCode: 400, error: "Validation Error" });
    }
    if (error instanceof TreemichAuthError) {
      return reply.code(error.statusCode).send({ statusCode: error.statusCode, error: error.message });
    }
    return reply.code(500).send({ error: "Internal Server Error" });
  });

  await app.register(registerFocusShareGuestGraphRoute);
  return app;
};

describe("GET /share/guest/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes guest cookie + depth query to the service", async () => {
    mocks.getGuestGraph.mockResolvedValue({
      share: {
        publicId: "pub-1",
        label: null,
        focusAnchorPersonId: "A",
        maxAncestorDepth: 3,
        maxDescendantDepth: 3,
        maxCollateralDepth: 0
      },
      depths: { ancestorDepth: 1, descendantDepth: 1, collateralDepth: 0 },
      people: [],
      relationships: [],
      layout: {
        primaryFamilyUnitByPersonId: {},
        treeLayoutPreferences: {}
      }
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/share/guest/graph?ancestorDepth=1&descendantDepth=1",
      headers: { cookie: "treemich_share_session=guest-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.getGuestGraph).toHaveBeenCalledWith("guest-token", {
      ancestorDepth: 1,
      descendantDepth: 1
    });
    await app.close();
  });

  it("returns 401 when guest session is missing", async () => {
    mocks.getGuestGraph.mockRejectedValue(new TreemichAuthError("Unauthorized"));
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/share/guest/graph"
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
