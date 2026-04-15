import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { setSessionCookie } from "../auth/request.js";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const loginRateLimit = {
  max: 5,
  timeWindow: 60_000
} as const;

export const registerAuthLoginRoute = (app: FastifyInstance) => {
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: loginRateLimit
      }
    },
    async (request, reply) => {
      const body = bodySchema.parse(request.body);
      const result = await app.services.authService.loginWithImmich(body.email, body.password);
      setSessionCookie(reply, result.sessionToken);
      return reply.code(200).send(result.state);
    }
  );
};
