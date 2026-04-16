import type { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify";
import { readCookie } from "./auth/request.js";
import {
  AuthService,
  type AuthenticatedRequestContext,
  type LinkedAuthenticatedRequestContext
} from "./auth/service.js";
import { TreemichAuthError } from "./auth/service.js";
import { ImmichClientFactory } from "./integrations/immich/factory.js";
import { RelationshipService } from "./relationships/service.js";

export type AppServices = {
  authService: AuthService;
  immichClientFactory: ImmichClientFactory;
  relationshipService: RelationshipService;
};

export const buildServices = (): AppServices => ({
  authService: new AuthService(),
  immichClientFactory: new ImmichClientFactory(),
  relationshipService: new RelationshipService()
});

declare module "fastify" {
  interface FastifyInstance {
    services: AppServices;
  }

  interface FastifyRequest {
    auth: AuthenticatedRequestContext | null;
  }
}

export const registerServices = (app: FastifyInstance, services: AppServices) => {
  app.decorate("services", services);
};

const hasLinkedAccountContext = (
  auth: AuthenticatedRequestContext
): auth is LinkedAuthenticatedRequestContext => "linkedAccount" in auth && auth.linkedAccount != null;

export const getImmichClientForRequest = async (request: FastifyRequest) => {
  if (!request.auth) {
    throw new TreemichAuthError("Unauthorized");
  }

  const authWithLinkedAccount: LinkedAuthenticatedRequestContext = hasLinkedAccountContext(request.auth)
    ? request.auth
    : await request.server.services.authService.requireLinkedSession(readCookie(request));
  request.auth = authWithLinkedAccount;

  return request.server.services.immichClientFactory.getClient(authWithLinkedAccount.linkedAccount);
};
