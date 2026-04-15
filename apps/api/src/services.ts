import type { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify";
import { AuthService, type AuthenticatedRequestContext } from "./auth/service.js";
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

export const getImmichClientForRequest = (request: FastifyRequest) => {
  if (!request.auth) {
    throw new Error("Authenticated request required");
  }

  return request.server.services.immichClientFactory.getClient(request.auth.linkedAccount);
};
