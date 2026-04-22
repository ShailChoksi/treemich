/**
 * @file Registers `GET /people/cooccurrence/status` — current co-occurrence job and schedule snapshot.
 */

import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";

export const registerCooccurrenceStatusGetRoute = (app: FastifyInstance) => {
  app.get("/people/cooccurrence/status", async (request) => {
    const auth = getRequiredAuth(request);
    return app.services.cooccurrenceService.getStatus(auth.user.id);
  });
};
