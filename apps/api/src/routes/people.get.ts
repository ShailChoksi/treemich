/**
 * @file Registers person-native `/people` routes.
 */

import type { FastifyInstance } from "fastify";
import {
  createPersonBodySchema,
  createPersonExternalIdentityBodySchema,
  patchPersonBodySchema
} from "@treemich/shared";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";

const querySchema = z
  .object({
    q: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    offset: z.coerce.number().int().min(0).optional()
  })
  .superRefine((value, ctx) => {
    if (value.limit != null && (value.q == null || value.q.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`limit` requires a non-empty `q` search query"
      });
    }
    if (value.offset != null && value.limit == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`offset` requires `limit`"
      });
    }
  });

const paramsSchema = z.object({
  id: z.string().min(1)
});

const identityParamsSchema = z.object({
  id: z.string().min(1),
  identityId: z.string().min(1)
});

export const registerPeopleGetRoute = (app: FastifyInstance) => {
  app.get("/people", async (request) => {
    const auth = getRequiredAuth(request);
    const { q, limit, offset } = querySchema.parse(request.query);
    if (limit != null && q != null) {
      const page = await app.services.personService.listSearchPaged(auth.user.id, q, limit, offset ?? 0);
      const connectedIds = await app.services.relationshipService.getConnectedPersonIds(
        auth.user.id,
        page.people.map((person) => person.id)
      );
      return {
        people: page.people.map((person) => ({ ...person, hasRelationship: connectedIds.has(person.id) })),
        nextOffset: page.nextOffset
      };
    }
    const people = await app.services.personService.list(auth.user.id, q);
    const connectedIds = await app.services.relationshipService.getConnectedPersonIds(
      auth.user.id,
      people.map((person) => person.id)
    );
    return { people: people.map((person) => ({ ...person, hasRelationship: connectedIds.has(person.id) })) };
  });

  app.post("/people", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const body = createPersonBodySchema.parse(request.body);
    const person = await app.services.personService.create(auth.user.id, body);
    if (body.birthDate !== undefined || body.deathDate !== undefined) {
      await app.services.lifeEventService.syncPersonProfileFieldsToLifeEvents(auth.user.id, person.id, {
        ...(body.birthDate !== undefined ? { birthDate: body.birthDate } : {}),
        ...(body.deathDate !== undefined ? { deathDate: body.deathDate } : {})
      });
    }
    return reply.code(201).send(person);
  });

  app.get("/people/:id", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    const row = await app.services.personService.get(auth.user.id, id);
    return { person: row };
  });

  app.patch("/people/:id", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    const body = patchPersonBodySchema.parse(request.body);
    const person = await app.services.personService.update(auth.user.id, id, body);
    if (body.birthDate !== undefined || body.deathDate !== undefined) {
      await app.services.lifeEventService.syncPersonProfileFieldsToLifeEvents(auth.user.id, person.id, {
        ...(body.birthDate !== undefined ? { birthDate: body.birthDate } : {}),
        ...(body.deathDate !== undefined ? { deathDate: body.deathDate } : {})
      });
    }
    return person;
  });

  app.delete("/people/:id", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    await app.services.personService.delete(auth.user.id, id);
    return reply.code(204).send();
  });

  app.get("/people/:id/external-identities", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    return { externalIdentities: await app.services.personService.listExternalIdentities(auth.user.id, id) };
  });

  app.post("/people/:id/external-identities", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    const body = createPersonExternalIdentityBodySchema.parse(request.body);
    const externalIdentity = await app.services.personService.addExternalIdentity(auth.user.id, id, body);
    return reply.code(201).send(externalIdentity);
  });

  app.delete("/people/:id/external-identities/:identityId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id, identityId } = identityParamsSchema.parse(request.params);
    await app.services.personService.deleteExternalIdentity(auth.user.id, id, identityId);
    return reply.code(204).send();
  });
};
