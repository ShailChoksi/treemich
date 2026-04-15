import { Gender } from "@prisma/client";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";

const paramsSchema = z.object({
  id: z.string().min(1)
});

const bodySchema = z
  .object({
    gender: z.nativeEnum(Gender).optional(),
    birthDate: z.string().min(1).optional().nullable()
  })
  .refine((body) => body.gender !== undefined || body.birthDate !== undefined, {
    message: "At least one profile field must be provided"
  });

export const registerPeoplePatchRoute = (app: FastifyInstance) => {
  app.patch("/people/:id", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);
    return app.services.relationshipService.upsertProfile(auth.user.id, id, {
      gender: body.gender,
      birthDateOverride: body.birthDate
    });
  });
};
