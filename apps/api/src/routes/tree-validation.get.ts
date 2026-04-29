/**
 * @file Registers `GET /tree/validation` — optional full-tree validation findings (feature-flagged).
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { isTreeValidationEngineEnabled } from "../config/env.js";
import { getRequiredAuth } from "../auth/request.js";
import { computeTreeValidationForUser } from "../validation/treeValidationService.js";

const querySchema = z.object({
  persist: z.enum(["true", "false"]).optional()
});

/**
 * On-demand full-tree validation (read-only). Gated by `TREEMICH_VALIDATION_ENGINE_ENABLED`.
 * Per-person `GET /people/:id/life-events/validation` is always available for targeted checks.
 */
export const registerTreeValidationGetRoute = (app: FastifyInstance) => {
  app.get("/tree/validation", async (request) => {
    const auth = getRequiredAuth(request);
    const query = querySchema.parse(request.query);
    if (query.persist === "true") {
      throw {
        statusCode: 400,
        message: "GET /tree/validation is read-only; use POST /validation/recompute to persist findings"
      };
    }
    if (!isTreeValidationEngineEnabled()) {
      return { findings: [], engineDisabled: true as const, persist: false as const };
    }
    const findings = await computeTreeValidationForUser(auth.user.id);
    return { findings, engineDisabled: false as const, persist: false as const };
  });
};
