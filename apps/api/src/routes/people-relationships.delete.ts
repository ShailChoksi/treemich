import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";
import { relationshipTypes } from "../relationships/types.js";

const paramsSchema = z.object({
  id: z.string().min(1)
});

const querySchema = z.object({
  toPersonId: z.string().min(1),
  type: z.enum(relationshipTypes).optional()
});

export const registerPeopleRelationshipsDeleteRoute = (app: FastifyInstance) => {
  app.delete("/people/:id/relationships", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);

    const deleted = await app.services.relationshipService.deleteRelationship(
      auth.user.id,
      id,
      query.toPersonId,
      query.type
    );
    return {
      deletedCount: deleted.count
    };
  });
};
