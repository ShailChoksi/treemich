import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyReply } from "fastify";
import { ZodError } from "zod";
import { ImmichAuthenticationError } from "./integrations/immich/client.js";
import { readCookie } from "./auth/request.js";
import { TreemichAuthError } from "./auth/service.js";
import { env } from "./config/env.js";
import { prisma } from "./db/client.js";
import { registerAuthLinkStatusRoute } from "./routes/auth.link-status.js";
import { registerAuthLoginRoute } from "./routes/auth.login.js";
import { registerAuthLogoutRoute } from "./routes/auth.logout.js";
import { registerAuthMeRoute } from "./routes/auth.me.js";
import { registerExportAccountGetRoute } from "./routes/export-account.get.js";
import { registerCooccurrenceComputePostRoute } from "./routes/cooccurrence-compute.post.js";
import { registerCooccurrenceEdgesGetRoute } from "./routes/cooccurrence-edges.get.js";
import { registerCooccurrencePairGetRoute } from "./routes/cooccurrence-pair.get.js";
import { registerCooccurrenceStatusGetRoute } from "./routes/cooccurrence-status.get.js";
import { registerGraphLayoutPostRoute } from "./routes/graph-layout.post.js";
import { registerPeopleGetRoute } from "./routes/people.get.js";
import { registerPeopleCooccurrenceGetRoute } from "./routes/people-cooccurrence.get.js";
import { registerPeopleRelationshipsDeleteRoute } from "./routes/people-relationships.delete.js";
import { registerPeopleRelationshipsPatchRoute } from "./routes/people-relationships.patch.js";
import { registerPeopleLifeEventsRoutes } from "./routes/people-life-events.js";
import { registerPeoplePatchRoute } from "./routes/people.patch.js";
import { registerPeopleRelationshipsPostRoute } from "./routes/people-relationships.post.js";
import { registerPeopleThumbnailGetRoute } from "./routes/people-thumbnail.get.js";
import { registerRelationshipsGetRoute } from "./routes/relationships.get.js";
import { registerRelationshipsLifeEventsRoutes } from "./routes/relationships-life-events.js";
import { registerSearchGetRoute } from "./routes/search.get.js";
import { registerUserPreferencesGetRoute } from "./routes/user-preferences.get.js";
import { registerUserPreferencesPatchRoute } from "./routes/user-preferences.patch.js";
import { buildServices, registerServices, type AppServices } from "./services.js";

type BuildAppOptions = {
  services?: AppServices;
};

const isPrismaKnownRequestError = (
  error: unknown
): error is { code: string; message: string; name: string } => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown; name?: unknown };
  return (
    candidate.name === "PrismaClientKnownRequestError" &&
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  );
};

const hasStatusCode = (error: unknown): error is { statusCode: number; message: string } => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { statusCode?: unknown; message?: unknown };
  return typeof candidate.statusCode === "number" && typeof candidate.message === "string";
};

const prismaStatusByCode: Record<string, number> = {
  P2002: 400,
  P2003: 409,
  P2025: 404
};

const sendAuthError = (reply: FastifyReply, error: TreemichAuthError | ImmichAuthenticationError) =>
  reply.code(error.statusCode).send({
    statusCode: error.statusCode,
    error: error.message
  });

export const buildApp = (options: BuildAppOptions = {}) => {
  const app = Fastify({ logger: true });
  const services = options.services ?? buildServices();

  registerServices(app, services);
  app.decorateRequest("auth", null);

  app.register(cors, {
    origin: env.NODE_ENV === "production" ? (env.WEB_ORIGIN ?? false) : true,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });
  app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIME_WINDOW_MS
  });

  app.addHook("preHandler", async (request, reply) => {
    const routePath = request.routeOptions.url;
    if (
      routePath === "/health" ||
      routePath === "/auth/login" ||
      routePath === "/auth/me" ||
      routePath === "/auth/logout" ||
      request.method === "OPTIONS"
    ) {
      return;
    }

    try {
      request.auth = await app.services.authService.requireSession(readCookie(request));
    } catch (error) {
      if (error instanceof TreemichAuthError) {
        return sendAuthError(reply, error);
      }
      throw error;
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Validation Error",
        issues: error.issues
      });
    }

    if (isPrismaKnownRequestError(error)) {
      const statusCode = prismaStatusByCode[error.code] ?? 500;
      app.log.warn(
        {
          statusCode,
          prismaCode: error.code,
          prismaError: error.message
        },
        "Database request failed"
      );
      return reply.code(statusCode).send({
        statusCode,
        error: "Database Error",
        code: error.code,
        message: "Database operation failed"
      });
    }

    if (error instanceof TreemichAuthError || error instanceof ImmichAuthenticationError) {
      return sendAuthError(reply, error);
    }

    if (hasStatusCode(error)) {
      return reply.code(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.message
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      statusCode: 500,
      error: "Internal Server Error"
    });
  });

  app.get("/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (error) {
      app.log.error(error, "Health check database probe failed");
      return reply.code(503).send({
        ok: false,
        error: "Database unavailable"
      });
    }
  });
  app.register(registerAuthLoginRoute);
  app.register(registerAuthLogoutRoute);
  app.register(registerAuthMeRoute);
  app.register(registerAuthLinkStatusRoute);
  app.register(registerCooccurrenceComputePostRoute);
  app.register(registerCooccurrenceEdgesGetRoute);
  app.register(registerCooccurrencePairGetRoute);
  app.register(registerCooccurrenceStatusGetRoute);
  app.register(registerGraphLayoutPostRoute);
  app.register(registerPeopleGetRoute);
  app.register(registerPeopleCooccurrenceGetRoute);
  app.register(registerPeopleThumbnailGetRoute);
  app.register(registerPeopleRelationshipsPostRoute);
  app.register(registerPeopleRelationshipsDeleteRoute);
  app.register(registerPeopleRelationshipsPatchRoute);
  app.register(registerRelationshipsGetRoute);
  app.register(registerPeopleLifeEventsRoutes);
  app.register(registerRelationshipsLifeEventsRoutes);
  app.register(registerPeoplePatchRoute);
  app.register(registerSearchGetRoute);
  app.register(registerUserPreferencesGetRoute);
  app.register(registerUserPreferencesPatchRoute);
  app.register(registerExportAccountGetRoute);

  return app;
};
