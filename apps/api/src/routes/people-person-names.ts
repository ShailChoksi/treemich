/**
 * @file Alternate names CRUD and set-primary under `/people/:id/names`.
 */

import { createPersonNameBodySchema, patchPersonNameBodySchema } from "@treemich/shared";
import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { HttpNotFoundError, HttpValidationError } from "../lifeEvents/errors.js";

const personParamsSchema = z.object({
  id: z.string().min(1)
});

const nameParamsSchema = z.object({
  id: z.string().min(1),
  nameId: z.string().min(1)
});

const sendNameError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof HttpValidationError) {
    return reply.code(400).send({ statusCode: 400, error: error.message });
  }
  if (error instanceof HttpNotFoundError) {
    return reply.code(404).send({ statusCode: 404, error: error.message });
  }
  throw error;
};

export const registerPeoplePersonNamesRoutes = (app: FastifyInstance) => {
  app.get("/people/:id/names", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = personParamsSchema.parse(request.params);
    return { names: await app.services.personNameService.listByImmichPersonId(auth.user.id, id) };
  });

  app.post("/people/:id/names", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id } = personParamsSchema.parse(request.params);
    const body = createPersonNameBodySchema.parse(request.body);
    try {
      const created = await app.services.personNameService.create(auth.user.id, id, body);
      return reply.code(201).send(created);
    } catch (error) {
      return sendNameError(reply, error);
    }
  });

  app.patch("/people/:id/names/:nameId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id, nameId } = nameParamsSchema.parse(request.params);
    const body = patchPersonNameBodySchema.parse(request.body);
    try {
      return await app.services.personNameService.update(auth.user.id, id, nameId, body);
    } catch (error) {
      return sendNameError(reply, error);
    }
  });

  app.delete("/people/:id/names/:nameId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id, nameId } = nameParamsSchema.parse(request.params);
    try {
      await app.services.personNameService.delete(auth.user.id, id, nameId);
      return reply.code(204).send();
    } catch (error) {
      return sendNameError(reply, error);
    }
  });

  app.post("/people/:id/names/:nameId/set-primary", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id, nameId } = nameParamsSchema.parse(request.params);
    try {
      return await app.services.personNameService.setPrimary(auth.user.id, id, nameId);
    } catch (error) {
      return sendNameError(reply, error);
    }
  });
};
