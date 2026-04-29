import { patchValidationFindingBodySchema, validationFindingListQuerySchema } from "@treemich/shared";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { isTreeValidationEngineEnabled } from "../config/env.js";
import { computeTreeValidationForUser } from "../validation/treeValidationService.js";

const findingParamsSchema = z.object({
  id: z.string().min(1)
});

export const registerValidationFindingRoutes = (app: FastifyInstance) => {
  app.get("/validation/findings", async (request) => {
    const auth = getRequiredAuth(request);
    const query = validationFindingListQuerySchema.parse(request.query);
    const findings = await app.services.validationFindingService!.list(auth.user.id, query);
    return { findings };
  });

  app.post("/validation/recompute", async (request, reply) => {
    const auth = getRequiredAuth(request);
    if (!isTreeValidationEngineEnabled()) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Validation engine disabled",
        engineDisabled: true
      });
    }
    const computed = await computeTreeValidationForUser(auth.user.id);
    const result = await app.services.validationFindingService!.persistTreeValidationFindings(
      auth.user.id,
      computed
    );
    return {
      findings: result.findings,
      summary: result.summary,
      engineDisabled: false
    };
  });

  app.patch("/validation/findings/:id", async (request) => {
    const auth = getRequiredAuth(request);
    const params = findingParamsSchema.parse(request.params);
    const body = patchValidationFindingBodySchema.parse(request.body);
    const finding = await app.services.validationFindingService!.updateStatus(
      auth.user.id,
      params.id,
      body.status
    );
    return finding;
  });
};
