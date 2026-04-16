import type { FastifyInstance } from "fastify";
import { clearSessionCookie, readCookie } from "../auth/request.js";

export const registerAuthLogoutRoute = (app: FastifyInstance) => {
  app.post("/auth/logout", async (request, reply) => {
    await app.services.authService.logout(readCookie(request));
    clearSessionCookie(reply);
    return {
      success: true
    };
  });
};
