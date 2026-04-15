import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import type { AuthenticatedRequestContext, LinkedAuthenticatedRequestContext } from "../auth/service.js";

const hasLinkedAccount = (auth: AuthenticatedRequestContext): auth is LinkedAuthenticatedRequestContext =>
  "linkedAccount" in auth && auth.linkedAccount != null;

export const registerAuthLinkStatusRoute = (app: FastifyInstance) => {
  app.get("/auth/link-status", async (request) => {
    const auth = getRequiredAuth(request);
    if (!hasLinkedAccount(auth)) {
      return {
        linked: false
      };
    }

    return {
      linked: true,
      immichBaseUrl: auth.linkedAccount.immichBaseUrl,
      immichEmail: auth.linkedAccount.immichEmail,
      immichName: auth.linkedAccount.immichName
    };
  });
};
