import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";

export const registerAuthLinkStatusRoute = (app: FastifyInstance) => {
  app.get("/auth/link-status", async (request) => {
    const auth = getRequiredAuth(request);
    return {
      linked: true,
      immichBaseUrl: auth.linkedAccount.immichBaseUrl,
      immichEmail: auth.linkedAccount.immichEmail,
      immichName: auth.linkedAccount.immichName
    };
  });
};
