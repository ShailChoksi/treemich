import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { setSessionCookie } from "../auth/request.js";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const registerAuthLoginRoute = (app: FastifyInstance) => {
  app.post("/auth/login", async (request, reply) => {
    const body = bodySchema.parse(request.body);
    const result = await app.services.authService.loginWithImmich(body.email, body.password);
    setSessionCookie(reply, result.sessionToken);
    return reply.code(200).send(result.state);
  });
};
