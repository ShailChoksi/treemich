import { createLifeEventBodySchema, patchLifeEventBodySchema } from "@treemich/shared";
import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { HttpConflictError, HttpNotFoundError, HttpValidationError } from "../lifeEvents/errors.js";
import { lifeEventToJson } from "../lifeEvents/service.js";

const personParamsSchema = z.object({
  id: z.string().min(1)
});

const eventParamsSchema = z.object({
  id: z.string().min(1),
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

export const registerPeopleLifeEventsRoutes = (app: FastifyInstance) => {
  app.get("/people/:id/life-events", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = personParamsSchema.parse(request.params);
    const query = listQuerySchema.parse(request.query);
    const events = await app.services.lifeEventService.listPersonLifeEvents(auth.user.id, id, {
      includeCitations: query.include === "citations"
    });
    return { lifeEvents: events.map(lifeEventToJson) };
  });

  app.get("/people/:id/life-events/validation", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = personParamsSchema.parse(request.params);
    return app.services.lifeEventService.validatePersonLifeEvents(auth.user.id, id);
  });

  app.post("/people/:id/life-events", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id } = personParamsSchema.parse(request.params);
    const body = createLifeEventBodySchema.parse(request.body);
    try {
      const created = await app.services.lifeEventService.createPersonLifeEvent(auth.user.id, id, body);
      return lifeEventToJson(created);
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });

  app.patch("/people/:id/life-events/:eventId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id, eventId } = eventParamsSchema.parse(request.params);
    const body = patchLifeEventBodySchema.parse(request.body);
    try {
      const updated = await app.services.lifeEventService.updatePersonLifeEvent(
        auth.user.id,
        id,
        eventId,
        body
      );
      return lifeEventToJson(updated);
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });

  app.delete("/people/:id/life-events/:eventId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id, eventId } = eventParamsSchema.parse(request.params);
    try {
      await app.services.lifeEventService.deletePersonLifeEvent(auth.user.id, id, eventId);
      return reply.code(204).send();
    } catch (error) {
      return sendLifeEventError(reply, error);
    }
  });
};
