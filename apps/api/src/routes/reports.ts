import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";
import { isReportsEnabled } from "../config/env.js";
import { HttpNotFoundError, HttpValidationError } from "../lifeEvents/errors.js";
import { EXPENSIVE_ROUTE_RATE_LIMIT } from "./rate-limit.js";

const booleanQuerySchema = z
  .enum(["1", "0", "true", "false", "yes", "no", "on", "off"])
  .optional()
  .transform((value) => (value == null ? false : ["1", "true", "yes", "on"].includes(value)));

const depthQuerySchema = z.object({
  rootPersonId: z.string().min(1),
  depth: z.coerce.number().int().min(1).optional(),
  redactLiving: booleanQuerySchema
});

const familyGroupQuerySchema = z.object({
  familyId: z.string().min(1),
  redactLiving: booleanQuerySchema
});

const sendHttpError = (reply: FastifyReply, error: HttpNotFoundError | HttpValidationError) =>
  reply.code(error.statusCode).send({
    statusCode: error.statusCode,
    error: error.message
  });

export const registerReportRoutes = (app: FastifyInstance) => {
  if (!isReportsEnabled()) {
    return;
  }
  const reportService = app.services.reportService;
  if (!reportService) {
    return;
  }

  app.get(
    "/reports/pedigree",
    { config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } },
    async (request, reply) => {
      const auth = getRequiredAuth(request);
      const query = depthQuerySchema.parse(request.query);
      try {
        return await reportService.buildPedigreeReport(auth.user.id, {
          rootPersonId: query.rootPersonId,
          depth: query.depth ?? 4,
          redactLiving: query.redactLiving
        });
      } catch (error) {
        if (error instanceof HttpNotFoundError || error instanceof HttpValidationError) {
          return sendHttpError(reply, error);
        }
        throw error;
      }
    }
  );

  app.get(
    "/reports/descendants",
    { config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } },
    async (request, reply) => {
      const auth = getRequiredAuth(request);
      const query = depthQuerySchema.parse(request.query);
      try {
        return await reportService.buildDescendantReport(auth.user.id, {
          rootPersonId: query.rootPersonId,
          depth: query.depth ?? 3,
          redactLiving: query.redactLiving
        });
      } catch (error) {
        if (error instanceof HttpNotFoundError || error instanceof HttpValidationError) {
          return sendHttpError(reply, error);
        }
        throw error;
      }
    }
  );

  app.get(
    "/reports/family-group",
    { config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } },
    async (request, reply) => {
      const auth = getRequiredAuth(request);
      const query = familyGroupQuerySchema.parse(request.query);
      try {
        return await reportService.buildFamilyGroupSheet(auth.user.id, query);
      } catch (error) {
        if (error instanceof HttpNotFoundError || error instanceof HttpValidationError) {
          return sendHttpError(reply, error);
        }
        throw error;
      }
    }
  );

  app.get(
    "/reports/register",
    { config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } },
    async (request, reply) => {
      const auth = getRequiredAuth(request);
      const query = depthQuerySchema.parse(request.query);
      try {
        return await reportService.buildRegisterReport(auth.user.id, {
          rootPersonId: query.rootPersonId,
          depth: query.depth ?? 3,
          redactLiving: query.redactLiving
        });
      } catch (error) {
        if (error instanceof HttpNotFoundError || error instanceof HttpValidationError) {
          return sendHttpError(reply, error);
        }
        throw error;
      }
    }
  );
};
