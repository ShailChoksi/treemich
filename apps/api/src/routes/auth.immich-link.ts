/**
 * @file Authenticated Immich provider credential linking.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth, readCookie } from "../auth/request.js";

const linkBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const registerAuthImmichLinkRoutes = (app: FastifyInstance) => {
  app.post("/auth/immich/link", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const body = linkBodySchema.parse(request.body);
    const linkStatus = await app.services.authService.linkImmichAccount(
      auth.user.id,
      body.email,
      body.password
    );
    app.services.authService.clearSessionCacheForToken(readCookie(request));
    request.log.info(
      { userId: auth.user.id, immichBaseUrl: linkStatus.immichBaseUrl },
      "Linked Immich account"
    );
    return reply.code(200).send(linkStatus);
  });

  app.delete("/auth/immich/link", async (request) => {
    const auth = getRequiredAuth(request);
    const linkStatus = await app.services.authService.unlinkImmichAccount(auth.user.id);
    app.services.authService.clearSessionCacheForToken(readCookie(request));
    request.log.info({ userId: auth.user.id }, "Unlinked Immich account");
    return linkStatus;
  });
};
