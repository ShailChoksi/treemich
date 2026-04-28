/**
 * @file Registers `GET /people/:id/thumbnail` — proxies Immich face thumbnail bytes for the web UI.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { openStoredMediaReadStream, storageKeyFromUrl } from "../evidence/mediaStorage.js";
import { importImmichThumbnailForIdentity } from "../integrations/immich/importProvider.js";
import { getImmichClientForRequest } from "../services.js";

const paramsSchema = z.object({
  id: z.string().min(1)
});

export const registerPeopleThumbnailGetRoute = (app: FastifyInstance) => {
  app.get("/people/:id/thumbnail", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const auth = request.auth;
    if (!auth) {
      return reply.code(401).send({ statusCode: 401, error: "Unauthorized" });
    }
    const person = await app.services.personService.get(auth.user.id, id);
    const storedThumbnail = person.thumbnails[0];
    const storageKey = storedThumbnail?.storageUrl ? storageKeyFromUrl(storedThumbnail.storageUrl) : null;
    if (storedThumbnail && storageKey) {
      const stored = await openStoredMediaReadStream(storageKey);
      return reply
        .header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
        .type(storedThumbnail.mimeType ?? "image/jpeg")
        .send(stored.stream);
    }
    if (storedThumbnail?.storageUrl) {
      return reply.redirect(storedThumbnail.storageUrl);
    }

    const immichIdentity = person.externalIdentities.find((identity) => identity.provider === "IMMICH");
    if (immichIdentity) {
      try {
        const thumbnail = await (
          await getImmichClientForRequest(request)
        ).getPersonThumbnail(immichIdentity.providerPersonId);
        return reply
          .header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
          .type(thumbnail.contentType)
          .send(thumbnail.data);
      } catch {
        // Fall through to generated placeholder; Immich is optional.
      }
    }
    const label =
      [person.givenName, person.surname].filter(Boolean).join(" ") || person.displayNameOverride || "Person";
    const initials = label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="128" fill="#334155"/><text x="128" y="146" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#e2e8f0">${initials || "?"}</text></svg>`;
    return reply
      .header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
      .type("image/svg+xml")
      .send(svg);
  });

  app.post("/people/:id/thumbnail/import/immich", async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      return reply.code(401).send({ statusCode: 401, error: "Unauthorized" });
    }
    const { id } = paramsSchema.parse(request.params);
    const person = await app.services.personService.get(auth.user.id, id);
    const immichIdentity = person.externalIdentities.find((identity) => identity.provider === "IMMICH");
    if (!immichIdentity) {
      return reply.code(404).send({ statusCode: 404, error: "Immich identity not linked" });
    }
    const thumbnail = await importImmichThumbnailForIdentity({
      userId: auth.user.id,
      personId: person.id,
      identity: immichIdentity,
      immichClient: await getImmichClientForRequest(request)
    });
    return reply.code(201).send(thumbnail);
  });
};
