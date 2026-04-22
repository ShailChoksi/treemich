import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { setSessionCookie } from "../auth/request.js";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

/** Stricter than global API limits: mitigates credential stuffing / Immich brute-force. */
const LOGIN_RATE_LIMIT = {
  max: 5,
  timeWindow: 60_000
} as const;

/**
 * Registers POST /auth/login with an explicit @fastify/rate-limit scope (not only route config),
 * so login attempts are capped independently of the default app-wide limiter.
 */
export const registerAuthLoginRoute: FastifyPluginAsync = async (app) => {
  await app.register(async (loginScope) => {
    await loginScope.register(rateLimit, LOGIN_RATE_LIMIT);
    loginScope.post("/auth/login", async (request, reply) => {
      const body = bodySchema.parse(request.body);
      const result = await app.services.authService.loginWithImmich(body.email, body.password);
      setSessionCookie(reply, result.sessionToken);
      return reply.code(200).send(result.state);
    });
  });
};
