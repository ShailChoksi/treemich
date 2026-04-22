import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { relationshipTypes } from "../relationships/types.js";

const paramsSchema = z.object({
  id: z.string().min(1)
});

const bodySchema = z
  .object({
    toPersonId: z.string().min(1),
    relationshipType: z.enum(relationshipTypes),
    marriageAnniversaryDate: z.string().optional().nullable(),
    divorceDate: z.string().optional().nullable()
  })
  .superRefine((body, context) => {
    if (body.relationshipType === "SPOUSE_OF") {
      return;
    }

    if (body.marriageAnniversaryDate !== undefined || body.divorceDate !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Spouse dates can only be provided for spouse relationships"
      });
    }
  });

export const registerPeopleRelationshipsPostRoute = (app: FastifyInstance) => {
  app.post("/people/:id/relationships", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);
    const normalizeOptionalString = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() ? value.trim() : null;

    const marriageAnniversaryDate = normalizeOptionalString(body.marriageAnniversaryDate);
    const divorceDate = normalizeOptionalString(body.divorceDate);

    const created = await app.services.relationshipService.upsertRelationship(
      auth.user.id,
      id,
      body.toPersonId,
      body.relationshipType
    );

    if (body.relationshipType === "SPOUSE_OF") {
      await app.services.lifeEventService.syncSpouseDatesToLifeEvents(auth.user.id, id, body.toPersonId, {
        ...(body.marriageAnniversaryDate !== undefined ? { marriageAnniversaryDate } : {}),
        ...(body.divorceDate !== undefined ? { divorceDate } : {})
      });
    }

    return reply.code(201).send(created);
  });
};
