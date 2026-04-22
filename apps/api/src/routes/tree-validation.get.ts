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
    querySchema.parse(request.query);
    if (!isTreeValidationEngineEnabled()) {
      return { findings: [], engineDisabled: true as const, persist: false as const };
    }
    const findings = await computeTreeValidationForUser(auth.user.id, app.services.lifeEventService);
    return { findings, engineDisabled: false as const, persist: false as const };
  });
};
