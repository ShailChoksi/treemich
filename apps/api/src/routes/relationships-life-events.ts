import { createLifeEventBodySchema, patchLifeEventBodySchema } from "@treemich/shared";
import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { HttpConflictError, HttpNotFoundError, HttpValidationError } from "../lifeEvents/errors.js";
import { lifeEventToJson } from "../lifeEvents/service.js";

const relParamsSchema = z.object({
  relationshipId: z.string().min(1)
});

const relEventParamsSchema = z.object({
  relationshipId: z.string().min(1),
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

export const registerRelationshipsLifeEventsRoutes = (app: FastifyInstance) => {
  app.get("/relationships/:relationshipId/life-events", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { relationshipId } = relParamsSchema.parse(request.params);
    const query = listQuerySchema.parse(request.query);
    try {
      const events = await app.services.lifeEventService.listRelationshipLifeEvents(
        auth.user.id,
        relationshipId,
        { includeCitations: query.include === "citations" }
      );
      return { lifeEvents: events.map(lifeEventToJson) };
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });

  app.post("/relationships/:relationshipId/life-events", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { relationshipId } = relParamsSchema.parse(request.params);
    const body = createLifeEventBodySchema.parse(request.body);
    try {
      const created = await app.services.lifeEventService.createRelationshipLifeEvent(
        auth.user.id,
        relationshipId,
        body
      );
      return lifeEventToJson(created);
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });

  app.patch("/relationships/:relationshipId/life-events/:eventId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { relationshipId, eventId } = relEventParamsSchema.parse(request.params);
    const body = patchLifeEventBodySchema.parse(request.body);
    try {
      const updated = await app.services.lifeEventService.updateRelationshipLifeEvent(
        auth.user.id,
        relationshipId,
        eventId,
        body
      );
      return lifeEventToJson(updated);
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });

  app.delete("/relationships/:relationshipId/life-events/:eventId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { relationshipId, eventId } = relEventParamsSchema.parse(request.params);
    try {
      await app.services.lifeEventService.deleteRelationshipLifeEvent(auth.user.id, relationshipId, eventId);
      return reply.code(204).send();
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });
};
