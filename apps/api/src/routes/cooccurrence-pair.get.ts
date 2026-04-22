/**
 * @file Registers `GET /people/cooccurrence/pair` — co-occurrence detail for a specific person pair.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";

const querySchema = z.object({
  personA: z.string().trim().min(1),
  personB: z.string().trim().min(1)
});

export const registerCooccurrencePairGetRoute = (app: FastifyInstance) => {
  app.get("/people/cooccurrence/pair", async (request) => {
    const auth = getRequiredAuth(request);
    const query = querySchema.parse(request.query);
    return app.services.cooccurrenceService.getEdgeBetween(auth.user.id, query.personA, query.personB);
  });
};
