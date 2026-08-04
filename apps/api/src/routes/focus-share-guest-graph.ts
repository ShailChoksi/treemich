/**
 * @file Guest Focus Share graph read — membership-scoped people + relationships.
 */

import { guestFocusShareGraphQuerySchema } from "@treemich/shared";
import type { FastifyInstance } from "fastify";
import { readShareSessionCookie } from "../auth/request.js";

export const registerFocusShareGuestGraphRoute = (app: FastifyInstance) => {
  app.get("/share/guest/graph", async (request) => {
    const query = guestFocusShareGraphQuerySchema.parse(request.query);
    return app.services.focusShareService.getGuestGraph(readShareSessionCookie(request), query);
  });
};
