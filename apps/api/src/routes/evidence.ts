/**
 * @file Phase 3 evidence: repositories, shared sources, media objects and links.
 */

import {
  createMediaLinkBodySchema,
  createMediaObjectBodySchema,
  createRepositoryBodySchema,
  createSourceBodySchema,
  patchMediaObjectBodySchema,
  patchRepositoryBodySchema,
  patchSourceBodySchema,
  sourceListQuerySchema
} from "@treemich/shared";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";

const idParams = z.object({ id: z.string().min(1) });
const mediaIdParams = z.object({ mediaId: z.string().min(1) });
const linkIdParams = z.object({ linkId: z.string().min(1) });

export const registerEvidenceRoutes = (app: FastifyInstance) => {
  app.get("/evidence/repositories", async (request) => {
    const auth = getRequiredAuth(request);
    const rows = await app.services.evidenceService.listRepositories(auth.user.id);
    return { repositories: rows };
  });

  app.post("/evidence/repositories", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const body = createRepositoryBodySchema.parse(request.body);
    const row = await app.services.evidenceService.createRepository(auth.user.id, body);
    return reply.code(201).send(row);
  });

  app.patch("/evidence/repositories/:id", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = idParams.parse(request.params);
    const body = patchRepositoryBodySchema.parse(request.body);
    return app.services.evidenceService.updateRepository(auth.user.id, id, body);
  });

  app.delete("/evidence/repositories/:id", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id } = idParams.parse(request.params);
    await app.services.evidenceService.deleteRepository(auth.user.id, id);
    return reply.code(204).send();
  });

  app.get("/evidence/sources", async (request) => {
    const auth = getRequiredAuth(request);
    const query = sourceListQuerySchema.parse(request.query);
    const rows = await app.services.evidenceService.listSources(auth.user.id, query.q);
    return { sources: rows };
  });

  app.post("/evidence/sources", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const body = createSourceBodySchema.parse(request.body);
    const row = await app.services.evidenceService.createSource(auth.user.id, body);
    return reply.code(201).send(row);
  });

  app.patch("/evidence/sources/:id", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = idParams.parse(request.params);
    const body = patchSourceBodySchema.parse(request.body);
    return app.services.evidenceService.updateSource(auth.user.id, id, body);
  });

  app.delete("/evidence/sources/:id", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id } = idParams.parse(request.params);
    await app.services.evidenceService.deleteSource(auth.user.id, id);
    return reply.code(204).send();
  });

  app.get("/evidence/media", async (request) => {
    const auth = getRequiredAuth(request);
    const rows = await app.services.evidenceService.listMediaObjects(auth.user.id);
    return { mediaObjects: rows };
  });

  app.post("/evidence/media", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const body = createMediaObjectBodySchema.parse(request.body);
    const row = await app.services.evidenceService.createMediaObject(auth.user.id, body);
    return reply.code(201).send(row);
  });

  app.patch("/evidence/media/:id", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = idParams.parse(request.params);
    const body = patchMediaObjectBodySchema.parse(request.body);
    return app.services.evidenceService.updateMediaObject(auth.user.id, id, body);
  });

  app.delete("/evidence/media/:id", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id } = idParams.parse(request.params);
    await app.services.evidenceService.deleteMediaObject(auth.user.id, id);
    return reply.code(204).send();
  });

  app.get("/evidence/media/:mediaId/links", async (request) => {
    const auth = getRequiredAuth(request);
    const { mediaId } = mediaIdParams.parse(request.params);
    const links = await app.services.evidenceService.listMediaLinksForObject(auth.user.id, mediaId);
    return { links };
  });

  app.post("/evidence/media/:mediaId/links", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { mediaId } = mediaIdParams.parse(request.params);
    const body = createMediaLinkBodySchema.parse(request.body);
    const link = await app.services.evidenceService.createMediaLink(auth.user.id, mediaId, body);
    return reply.code(201).send(link);
  });

  app.delete("/evidence/media-links/:linkId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { linkId } = linkIdParams.parse(request.params);
    await app.services.evidenceService.deleteMediaLink(auth.user.id, linkId);
    return reply.code(204).send();
  });
};
