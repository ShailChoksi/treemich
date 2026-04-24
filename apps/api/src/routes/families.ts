/**
 * @file Family (FAM-style) CRUD under `/families` plus `GET /people/:id/families`.
 */

import { createFamilyBodySchema, patchFamilyBodySchema } from "@treemich/shared";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { isFamilyModelEnabled } from "../config/env.js";
import { familyToJson } from "../families/service.js";
import { HttpNotFoundError, HttpValidationError } from "../lifeEvents/errors.js";

const familyIdParamsSchema = z.object({
  familyId: z.string().min(1)
});

const personParamsSchema = z.object({
  id: z.string().min(1)
});

const sendHttpError = (
  reply: import("fastify").FastifyReply,
  error: HttpNotFoundError | HttpValidationError
) =>
  reply.code(error.statusCode).send({
    statusCode: error.statusCode,
    error: error.message
  });

export const registerFamilyRoutes = (app: FastifyInstance) => {
  if (!isFamilyModelEnabled()) {
    return;
  }

  app.get("/families", async (request) => {
    const auth = getRequiredAuth(request);
    const rows = await app.services.familyService.listFamilies(auth.user.id);
    return { families: rows.map(familyToJson) };
  });

  app.get("/families/:familyId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { familyId } = familyIdParamsSchema.parse(request.params);
    try {
      const row = await app.services.familyService.getFamily(auth.user.id, familyId);
      return familyToJson(row);
    } catch (error) {
      if (error instanceof HttpNotFoundError) {
        return sendHttpError(reply, error);
      }
      throw error;
    }
  });

  app.post("/families", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const body = createFamilyBodySchema.parse(request.body);
    const row = await app.services.familyService.createFamily(auth.user.id, body);
    return reply.code(201).send(familyToJson(row));
  });

  app.patch("/families/:familyId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { familyId } = familyIdParamsSchema.parse(request.params);
    const body = patchFamilyBodySchema.parse(request.body);
    try {
      const row = await app.services.familyService.patchFamily(auth.user.id, familyId, body);
      return familyToJson(row);
    } catch (error) {
      if (error instanceof HttpNotFoundError || error instanceof HttpValidationError) {
        return sendHttpError(reply, error);
      }
      throw error;
    }
  });

  app.delete("/families/:familyId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { familyId } = familyIdParamsSchema.parse(request.params);
    try {
      await app.services.familyService.deleteFamily(auth.user.id, familyId);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof HttpNotFoundError) {
        return sendHttpError(reply, error);
      }
      throw error;
    }
  });

  app.get("/people/:id/families", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = personParamsSchema.parse(request.params);
    const rows = await app.services.familyService.listFamiliesForPerson(auth.user.id, id);
    return { families: rows.map(familyToJson) };
  });
};
