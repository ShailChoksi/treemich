import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";

const querySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(2000).optional()
});

export const registerRelationshipsGetRoute = (app: FastifyInstance) => {
  app.get("/relationships", async (request) => {
    const auth = getRequiredAuth(request);
    const query = querySchema.parse(request.query);
    return app.services.relationshipService.listRelationships(auth.user.id, {
      cursor: query.cursor,
      limit: query.limit
    });
  });
};
