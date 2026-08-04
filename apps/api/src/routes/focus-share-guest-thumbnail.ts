/**
 * @file Guest Focus Share person thumbnails — membership-gated, private cache.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { readShareSessionCookie } from "../auth/request.js";
import { openStoredMediaReadStream, storageKeyFromUrl } from "../evidence/mediaStorage.js";
import { prisma } from "../db/client.js";

const paramsSchema = z.object({
  personId: z.string().min(1)
});

const PRIVATE_THUMB_CACHE = "private, max-age=86400, stale-while-revalidate=604800";

const initialsSvg = (label: string) => {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="128" fill="#334155"/><text x="128" y="146" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#e2e8f0">${initials || "?"}</text></svg>`;
};

export const registerFocusShareGuestThumbnailRoute = (app: FastifyInstance) => {
  app.get("/share/guest/people/:personId/thumbnail", async (request, reply) => {
    const { personId } = paramsSchema.parse(request.params);
    const { guest, person } = await app.services.focusShareService.requireGuestPersonInMembership(
      readShareSessionCookie(request),
      personId
    );

    const storedThumbnail = person.thumbnails[0];
    const storageKey = storedThumbnail?.storageUrl ? storageKeyFromUrl(storedThumbnail.storageUrl) : null;
    if (storedThumbnail && storageKey) {
      const stored = await openStoredMediaReadStream(storageKey);
      return reply
        .header("Cache-Control", PRIVATE_THUMB_CACHE)
        .type(storedThumbnail.mimeType ?? "image/jpeg")
        .send(stored.stream);
    }
    if (storedThumbnail?.storageUrl) {
      return reply.redirect(storedThumbnail.storageUrl);
    }

    const immichIdentity = person.externalIdentities.find((identity) => identity.provider === "IMMICH");
    if (immichIdentity) {
      try {
        const linkedAccount = await prisma.linkedImmichAccount.findUnique({
          where: { userId: guest.share.userId }
        });
        if (linkedAccount) {
          const thumbnail = await app.services.immichClientFactory
            .getClient(linkedAccount)
            .getPersonThumbnail(immichIdentity.providerPersonId);
          return reply
            .header("Cache-Control", PRIVATE_THUMB_CACHE)
            .type(thumbnail.contentType)
            .send(thumbnail.data);
        }
      } catch {
        // Fall through to generated placeholder; Immich is optional.
      }
    }

    const label =
      [person.givenName, person.surname].filter(Boolean).join(" ") || person.displayNameOverride || "Person";
    return reply.header("Cache-Control", PRIVATE_THUMB_CACHE).type("image/svg+xml").send(initialsSvg(label));
  });
};
