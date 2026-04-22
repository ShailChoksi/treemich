/**
 * @file Registers `POST /people/cooccurrence/compute` — kicks off (or resumes) photo co-occurrence edge computation.
 */

import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { getImmichClientForRequest } from "../services.js";

export const registerCooccurrenceComputePostRoute = (app: FastifyInstance) => {
  app.post("/people/cooccurrence/compute", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const job = await app.services.cooccurrenceService.triggerComputation(
      auth.user.id,
      await getImmichClientForRequest(request)
    );

    return reply.code(202).send({
      jobId: job.id,
      status: job.status
    });
  });
};
