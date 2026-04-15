import type { FastifyInstance } from "fastify";
import { clearSessionCookie, readCookie } from "../auth/request.js";

export const registerAuthMeRoute = (app: FastifyInstance) => {
  app.get("/auth/me", async (request, reply) => {
    const state = await app.services.authService.getAuthState(readCookie(request));
    if (!state.authenticated) {
      clearSessionCookie(reply);
    }
    return state;
  });
};
