/**
 * @file Registers `POST /auth/change-password` — authenticated route to update password and clear the forced-change flag.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { readCookie, getRequiredAuth } from "../auth/request.js";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

export const registerAuthChangePasswordRoute: FastifyPluginAsync = async (app) => {
  app.post("/auth/change-password", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { currentPassword, newPassword } = bodySchema.parse(request.body);
    await app.services.authService.changePassword(auth.user.id, currentPassword, newPassword);
    app.services.authService.clearSessionCacheForToken(readCookie(request));
    return reply.code(200).send({ ok: true });
  });
};
