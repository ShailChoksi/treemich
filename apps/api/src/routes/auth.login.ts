/**
 * @file Registers `POST /auth/login` — Treemich login with dedicated rate limiting (credential stuffing mitigation).
 */

import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { setSessionCookie } from "../auth/request.js";
import { EXPENSIVE_ROUTE_RATE_LIMIT } from "./rate-limit.js";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  provider: z.enum(["treemich", "immich"]).optional().default("treemich")
});

/**
 * Registers POST /auth/login with an explicit @fastify/rate-limit scope (not only route config),
 * so login attempts are capped independently of the default app-wide limiter.
 */
export const registerAuthLoginRoute: FastifyPluginAsync = async (app) => {
  await app.register(async (loginScope) => {
    await loginScope.register(rateLimit, EXPENSIVE_ROUTE_RATE_LIMIT);
    loginScope.post(
      "/auth/login",
      { config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } },
      async (request, reply) => {
        const body = bodySchema.parse(request.body);
        const result =
          body.provider === "immich"
            ? await app.services.authService.loginWithImmich(body.email, body.password)
            : await app.services.authService.loginWithPassword(body.email, body.password);
        setSessionCookie(reply, result.sessionToken);
        return reply.code(200).send(result.state);
      }
    );
  });
};
