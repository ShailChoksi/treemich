/**
 * @file Registers `GET /auth/link-status` — whether the Treemich user is linked to Immich.
 */

import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { prisma } from "../db/client.js";

export const registerAuthLinkStatusRoute = (app: FastifyInstance) => {
  app.get("/auth/link-status", async (request) => {
    const auth = getRequiredAuth(request);
    const linked = await prisma.linkedImmichAccount.findUnique({
      where: { userId: auth.user.id }
    });
    if (!linked) {
      return {
        linked: false
      };
    }

    return {
      linked: true,
      immichBaseUrl: linked.immichBaseUrl,
      immichEmail: linked.immichEmail,
      immichName: linked.immichName
    };
  });
};
