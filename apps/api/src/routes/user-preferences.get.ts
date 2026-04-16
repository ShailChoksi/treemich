import type { FastifyInstance } from "fastify";
import { userPreferencesSchema } from "@treemich/shared";
import { getRequiredAuth } from "../auth/request.js";
import { prisma } from "../db/client.js";

export const registerUserPreferencesGetRoute = (app: FastifyInstance) => {
  app.get("/user/preferences", async (request) => {
    const auth = getRequiredAuth(request);
    const user = await prisma.treemichUser.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { preferences: true }
    });
    const parsed = userPreferencesSchema.safeParse(user.preferences);
    return parsed.success ? parsed.data : {};
  });
};
