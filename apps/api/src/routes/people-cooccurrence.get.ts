/**
 * @file Registers `GET /people/:id/cooccurrence` — photo co-occurrence suggestions for one person.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";

const querySchema = z.object({
  minSharedPhotos: z.coerce.number().int().positive().max(1000).default(2),
  minScore: z.coerce.number().min(0).max(1).default(0)
});

export const registerPeopleCooccurrenceGetRoute = (app: FastifyInstance) => {
  app.get("/people/cooccurrence", async (request) => {
    const auth = getRequiredAuth(request);
    const query = querySchema.parse(request.query);
    const options = {
      minSharedPhotos: query.minSharedPhotos,
      minScore: query.minScore
    };

    return (
      (await app.services.cooccurrenceService.getPersistedPhotoCooccurrence(auth.user.id, options)) ?? {
        clusters: [],
        edges: [],
        computedAt: new Date(0).toISOString(),
        sourcePhotoCount: 0
      }
    );
  });
};
