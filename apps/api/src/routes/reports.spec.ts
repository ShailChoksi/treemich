import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { AppServices } from "../services.js";
import { registerReportRoutes } from "./reports.js";

const auth = {
  user: { id: "user-1", email: "u@example.com", name: "User" },
  session: {
    id: "session-1",
    userId: "user-1",
    tokenHash: "hash",
    expiresAt: new Date(),
    user: { id: "user-1", email: "u@example.com", name: "User" }
  }
};

const buildRouteApp = async (reportService: AppServices["reportService"]) => {
  const app = Fastify();
  app.decorate("services", { reportService } as AppServices);
  app.decorateRequest("auth", null);
  app.addHook("preHandler", async (request) => {
    request.auth = auth as never;
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ statusCode: 400, error: "Validation Error" });
    }
    return reply.code(500).send({ statusCode: 500, error: "Internal Server Error" });
  });
  await app.register(registerReportRoutes);
  await app.ready();
  return app;
};

describe("report routes", () => {
  it("passes default pedigree depth, redaction, and user scope to the service", async () => {
    const buildPedigreeReport = vi.fn().mockResolvedValue({
      type: "pedigree",
      generatedAt: "2026-04-29T00:00:00.000Z",
      parameters: { rootPersonId: "p1", depth: 4, redactLiving: true },
      warnings: [],
      root: {
        id: "p1",
        displayName: "Living person",
        gender: "UNKNOWN",
        primaryName: null,
        alternateNames: [],
        isLiving: true,
        isRedacted: true,
        events: []
      },
      generations: [],
      edges: []
    });
    const app = await buildRouteApp({
      buildPedigreeReport,
      buildDescendantReport: vi.fn(),
      buildFamilyGroupSheet: vi.fn(),
      buildRegisterReport: vi.fn()
    } as unknown as AppServices["reportService"]);

    const res = await app.inject({
      method: "GET",
      url: "/reports/pedigree?rootPersonId=p1&redactLiving=true"
    });

    expect(res.statusCode).toBe(200);
    expect(buildPedigreeReport).toHaveBeenCalledWith("user-1", {
      rootPersonId: "p1",
      depth: 4,
      redactLiving: true
    });
    await app.close();
  });

  it("rejects missing report root ids with validation details", async () => {
    const app = await buildRouteApp({
      buildPedigreeReport: vi.fn(),
      buildDescendantReport: vi.fn(),
      buildFamilyGroupSheet: vi.fn(),
      buildRegisterReport: vi.fn()
    } as unknown as AppServices["reportService"]);

    const res = await app.inject({ method: "GET", url: "/reports/register" });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
