/**
 * @file Public Focus Share unlock — password gate with login-style rate limiting.
 */

import rateLimit from "@fastify/rate-limit";
import { unlockFocusShareBodySchema } from "@treemich/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { setShareSessionCookie } from "../auth/request.js";
import { EXPENSIVE_ROUTE_RATE_LIMIT } from "./rate-limit.js";

const paramsSchema = z.object({
  publicId: z.string().min(1)
});

/**
 * Registers `POST /share/:publicId/unlock` with a dedicated rate-limit scope
 * (same tier as `/auth/login`).
 */
export const registerFocusShareUnlockRoute: FastifyPluginAsync = async (app) => {
  await app.register(async (unlockScope) => {
    await unlockScope.register(rateLimit, EXPENSIVE_ROUTE_RATE_LIMIT);
    unlockScope.post(
      "/share/:publicId/unlock",
      { config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } },
      async (request, reply) => {
        const { publicId } = paramsSchema.parse(request.params);
        const body = unlockFocusShareBodySchema.parse(request.body);
        const result = await app.services.focusShareService.unlock(publicId, body.password);
        setShareSessionCookie(reply, result.sessionToken);
        return reply.code(200).send(result.response);
      }
    );
  });
};
