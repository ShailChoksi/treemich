/**
 * @file Registers `PATCH /user/preferences` — partial update of Treemich UI preferences (Zod-validated).
 */

import type { FastifyInstance } from "fastify";
import { userPreferencesSchema } from "@treemich/shared";
import { getRequiredAuth } from "../auth/request.js";
import { prisma } from "../db/client.js";
import { mergeUserPreferences, parseUserPreferences, withUserPreferenceDefaults } from "../preferences.js";

export const registerUserPreferencesPatchRoute = (app: FastifyInstance) => {
  app.patch("/user/preferences", async (request) => {
    const auth = getRequiredAuth(request);
    const incoming = userPreferencesSchema.parse(request.body);

    const user = await prisma.treemichUser.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { preferences: true }
    });

    const current = parseUserPreferences(user.preferences);
    const merged = mergeUserPreferences(current, incoming);

    const updated = await prisma.treemichUser.update({
      where: { id: auth.user.id },
      data: { preferences: merged },
      select: { preferences: true }
    });

    await app.services.cooccurrenceService.syncScheduleFromPreferences(auth.user.id);

    return withUserPreferenceDefaults(parseUserPreferences(updated.preferences));
  });
};
