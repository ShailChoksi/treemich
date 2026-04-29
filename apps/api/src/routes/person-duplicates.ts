import {
  mergePeopleBodySchema,
  patchPersonDuplicateCandidateBodySchema,
  personDuplicateListQuerySchema
} from "@treemich/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";
import { EXPENSIVE_ROUTE_RATE_LIMIT } from "./rate-limit.js";

const candidateParamsSchema = z.object({
  id: z.string().min(1)
});

export const registerPersonDuplicateRoutes = (app: FastifyInstance) => {
  app.get("/people/duplicates", async (request) => {
    const auth = getRequiredAuth(request);
    const query = personDuplicateListQuerySchema.parse(request.query);
    return { candidates: await app.services.personDuplicateService!.list(auth.user.id, query) };
  });

  app.post(
    "/people/duplicates/recompute",
    { config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } },
    async (request) => {
      const auth = getRequiredAuth(request);
      return app.services.personDuplicateService!.recomputeCandidates(auth.user.id);
    }
  );

  app.patch("/people/duplicates/:id", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = candidateParamsSchema.parse(request.params);
    const body = patchPersonDuplicateCandidateBodySchema.parse(request.body);
    return app.services.personDuplicateService!.updateStatus(auth.user.id, id, body.status);
  });

  app.post("/people/duplicates/:id/merge", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = candidateParamsSchema.parse(request.params);
    const body = mergePeopleBodySchema.parse(request.body);
    return app.services.personDuplicateService!.mergePeople(
      auth.user.id,
      id,
      body.canonicalPersonId,
      body.duplicatePersonId
    );
  });
};
