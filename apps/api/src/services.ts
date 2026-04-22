/**
 * @packageDocumentation
 * Composes domain services (auth, relationships, life events, co-occurrence, etc.) for injection on `FastifyInstance`.
 */

import type { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify";
import { readCookie } from "./auth/request.js";
import {
  AuthService,
  type AuthenticatedRequestContext,
  type LinkedAuthenticatedRequestContext
} from "./auth/service.js";
import { TreemichAuthError } from "./auth/service.js";
import { CooccurrenceService } from "./cooccurrence/service.js";
import { ImmichClientFactory } from "./integrations/immich/factory.js";
import { LifeEventService } from "./lifeEvents/service.js";
import { PersonNameService } from "./personNames/service.js";
import { ResearchTaskService } from "./researchTasks/service.js";
import { RelationshipService } from "./relationships/service.js";

/** Service container attached to each Fastify instance (`app.services`). */
export type AppServices = {
  authService: AuthService;
  cooccurrenceService: CooccurrenceService;
  immichClientFactory: ImmichClientFactory;
  relationshipService: RelationshipService;
  lifeEventService: LifeEventService;
  personNameService: PersonNameService;
  researchTaskService: ResearchTaskService;
};

/** Constructs default service instances (shared `LifeEventService` wired into `RelationshipService`). */
export const buildServices = (): AppServices => {
  const lifeEventService = new LifeEventService();
  return {
    authService: new AuthService(),
    cooccurrenceService: new CooccurrenceService(),
    immichClientFactory: new ImmichClientFactory(),
    relationshipService: new RelationshipService(lifeEventService),
    lifeEventService,
    personNameService: new PersonNameService(),
    researchTaskService: new ResearchTaskService()
  };
};

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
