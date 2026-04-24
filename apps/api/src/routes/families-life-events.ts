/**
 * @file Family-scoped life events (residence, census, custom) under `/families/:familyId/life-events`.
 */

import { createFamilyLifeEventBodySchema, patchLifeEventBodySchema } from "@treemich/shared";
import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { isFamilyModelEnabled } from "../config/env.js";
import { HttpConflictError, HttpNotFoundError, HttpValidationError } from "../lifeEvents/errors.js";
import { lifeEventToJson } from "../lifeEvents/service.js";

const familyParamsSchema = z.object({
  familyId: z.string().min(1)
});

const familyEventParamsSchema = z.object({
  familyId: z.string().min(1),
  eventId: z.string().min(1)
});

const listQuerySchema = z.object({
  include: z.enum(["citations"]).optional()
});

const sendLifeEventError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof HttpValidationError) {
    return reply.code(400).send({ statusCode: 400, error: error.message });
  }
  if (error instanceof HttpConflictError) {
    return reply.code(409).send({ statusCode: 409, error: error.message });
  }
  if (error instanceof HttpNotFoundError) {
    return reply.code(404).send({ statusCode: 404, error: error.message });
  }
  throw error;
};

export const registerFamiliesLifeEventsRoutes = (app: FastifyInstance) => {
  if (!isFamilyModelEnabled()) {
    return;
  }

  app.get("/families/:familyId/life-events", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { familyId } = familyParamsSchema.parse(request.params);
    const query = listQuerySchema.parse(request.query);
    try {
      const events = await app.services.lifeEventService.listFamilyLifeEvents(auth.user.id, familyId, {
        includeCitations: query.include === "citations"
      });
      return { lifeEvents: events.map(lifeEventToJson) };
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });

  app.post("/families/:familyId/life-events", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { familyId } = familyParamsSchema.parse(request.params);
    const body = createFamilyLifeEventBodySchema.parse(request.body);
    try {
      const created = await app.services.lifeEventService.createFamilyLifeEvent(auth.user.id, familyId, body);
      return lifeEventToJson(created);
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });

  app.patch("/families/:familyId/life-events/:eventId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { familyId, eventId } = familyEventParamsSchema.parse(request.params);
    const body = patchLifeEventBodySchema.parse(request.body);
    try {
      const updated = await app.services.lifeEventService.updateFamilyLifeEvent(
        auth.user.id,
        familyId,
        eventId,
        body
      );
      return lifeEventToJson(updated);
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });

  app.delete("/families/:familyId/life-events/:eventId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { familyId, eventId } = familyEventParamsSchema.parse(request.params);
    try {
      await app.services.lifeEventService.deleteFamilyLifeEvent(auth.user.id, familyId, eventId);
      return reply.code(204).send();
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });
};
