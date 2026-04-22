/**
 * @file Registers `GET /people/cooccurrence/edges` — paginated co-occurrence edges for graph/insights.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";

const querySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(2000).default(100),
  minSharedPhotos: z.coerce.number().int().positive().max(1000).optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
  personId: z.string().trim().min(1).optional()
});

export const registerCooccurrenceEdgesGetRoute = (app: FastifyInstance) => {
  app.get("/people/cooccurrence/edges", async (request) => {
    const auth = getRequiredAuth(request);
    const query = querySchema.parse(request.query);

    return app.services.cooccurrenceService.queryEdges(auth.user.id, query);
  });
};
