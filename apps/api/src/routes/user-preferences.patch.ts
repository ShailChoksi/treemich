import type { FastifyInstance } from "fastify";
import { userPreferencesSchema, type UserPreferences } from "@treemich/shared";
import { getRequiredAuth } from "../auth/request.js";
import { prisma } from "../db/client.js";

export const registerUserPreferencesPatchRoute = (app: FastifyInstance) => {
  app.patch("/user/preferences", async (request) => {
    const auth = getRequiredAuth(request);
    const incoming = userPreferencesSchema.parse(request.body);

    const user = await prisma.treemichUser.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { preferences: true }
    });

    const existing = userPreferencesSchema.safeParse(user.preferences);
    const current: UserPreferences = existing.success ? existing.data : {};

    const merged: UserPreferences = {
      ...current,
      ...incoming,
      graphFilterVisibility: incoming.graphFilterVisibility ?? current.graphFilterVisibility
    };

    const updated = await prisma.treemichUser.update({
      where: { id: auth.user.id },
      data: { preferences: merged },
      select: { preferences: true }
    });

    return userPreferencesSchema.parse(updated.preferences);
  });
};
