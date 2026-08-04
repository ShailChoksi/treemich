/**
 * @file Owner Focus Share routes: create/list/patch/rotate-password/revoke.
 */

import {
  createFocusShareBodySchema,
  patchFocusShareBodySchema,
  rotateFocusSharePasswordBodySchema
} from "@treemich/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";

const shareParamsSchema = z.object({
  shareId: z.string().min(1)
});

export const registerFocusShareRoutes = (app: FastifyInstance) => {
  app.get("/focus-shares", async (request) => {
    const auth = getRequiredAuth(request);
    const shares = await app.services.focusShareService.list(auth.user.id);
    return { shares };
  });

  app.post("/focus-shares", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const body = createFocusShareBodySchema.parse(request.body);
    const share = await app.services.focusShareService.create(auth.user.id, body);
    return reply.code(201).send(share);
  });

  app.patch("/focus-shares/:shareId", async (request) => {
    const auth = getRequiredAuth(request);
    const { shareId } = shareParamsSchema.parse(request.params);
    const body = patchFocusShareBodySchema.parse(request.body);
    return app.services.focusShareService.update(auth.user.id, shareId, body);
  });

  app.post("/focus-shares/:shareId/rotate-password", async (request) => {
    const auth = getRequiredAuth(request);
    const { shareId } = shareParamsSchema.parse(request.params);
    const body = rotateFocusSharePasswordBodySchema.parse(request.body);
    return app.services.focusShareService.rotatePassword(auth.user.id, shareId, body.password);
  });

  app.delete("/focus-shares/:shareId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { shareId } = shareParamsSchema.parse(request.params);
    await app.services.focusShareService.revoke(auth.user.id, shareId);
    return reply.code(204).send();
  });
};
