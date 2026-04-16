import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { relationshipTypes } from "../relationships/types.js";

const paramsSchema = z.object({
  id: z.string().min(1)
});

const bodySchema = z.object({
  toPersonId: z.string().min(1),
  relationshipType: z.enum(relationshipTypes)
});

export const registerPeopleRelationshipsPostRoute = (app: FastifyInstance) => {
  app.post("/people/:id/relationships", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const created = await app.services.relationshipService.upsertRelationship(
      auth.user.id,
      id,
      body.toPersonId,
      body.relationshipType
    );
    return reply.code(201).send(created);
  });
};
