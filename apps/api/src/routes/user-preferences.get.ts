/**
 * @file Registers `GET /user/preferences` — persisted UI preferences with server defaults merged in.
 */

import type { FastifyInstance } from "fastify";
import { parseUserPreferences, withUserPreferenceDefaults } from "../preferences.js";
import { getRequiredAuth } from "../auth/request.js";
import { prisma } from "../db/client.js";

export const registerUserPreferencesGetRoute = (app: FastifyInstance) => {
  app.get("/user/preferences", async (request) => {
    const auth = getRequiredAuth(request);
    const user = await prisma.treemichUser.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { preferences: true }
    });
    return withUserPreferenceDefaults(parseUserPreferences(user.preferences));
  });
};
