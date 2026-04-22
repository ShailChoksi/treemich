import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";

const paramsSchema = z.object({
  id: z.string().min(1)
});

const bodySchema = z
  .object({
    toPersonId: z.string().min(1),
    marriageAnniversaryDate: z.string().optional().nullable(),
    divorceDate: z.string().optional().nullable()
  })
  .refine((body) => body.marriageAnniversaryDate !== undefined || body.divorceDate !== undefined, {
    message: "At least one spouse date field must be provided"
  });

export const registerPeopleRelationshipsPatchRoute = (app: FastifyInstance) => {
  app.patch("/people/:id/relationships", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);
    const normalizeOptionalString = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() ? value.trim() : null;

    const marriageAnniversaryDate = normalizeOptionalString(body.marriageAnniversaryDate);
    const divorceDate = normalizeOptionalString(body.divorceDate);

    const exists = await app.services.relationshipService.hasSpouseRelationship(
      auth.user.id,
      id,
      body.toPersonId
    );
    if (!exists) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Spouse relationship not found"
      });
    }

    await app.services.lifeEventService.syncSpouseDatesToLifeEvents(auth.user.id, id, body.toPersonId, {
      ...(body.marriageAnniversaryDate !== undefined ? { marriageAnniversaryDate } : {}),
      ...(body.divorceDate !== undefined ? { divorceDate } : {})
    });

    return {
      updatedCount: 2
    };
  });
};
