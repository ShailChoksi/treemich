import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getImmichClientForRequest } from "../services.js";

const paramsSchema = z.object({
  id: z.string().min(1)
});

export const registerPeopleThumbnailGetRoute = (app: FastifyInstance) => {
  app.get("/people/:id/thumbnail", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const thumbnail = await (await getImmichClientForRequest(request)).getPersonThumbnail(id);
    return reply
      .header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
      .type(thumbnail.contentType)
      .send(thumbnail.data);
  });
};
