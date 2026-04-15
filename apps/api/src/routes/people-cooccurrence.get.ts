import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";
import { getImmichClientForRequest } from "../services.js";

const querySchema = z.object({
  minSharedPhotos: z.coerce.number().int().positive().max(1000).default(2),
  minScore: z.coerce.number().min(0).max(1).default(0)
});

export const registerPeopleCooccurrenceGetRoute = (app: FastifyInstance) => {
  app.get("/people/cooccurrence", async (request) => {
    const auth = getRequiredAuth(request);
    const query = querySchema.parse(request.query);
    return app.services.relationshipService.getPhotoCooccurrence(
      auth.user.id,
      getImmichClientForRequest(request),
      {
        minSharedPhotos: query.minSharedPhotos,
        minScore: query.minScore
      }
    );
  });
};
