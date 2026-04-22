import {
  createResearchTaskBodySchema,
  patchResearchTaskBodySchema,
  researchTaskQuerySchema
} from "@treemich/shared";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";

const taskParamsSchema = z.object({
  taskId: z.string().min(1)
});

export const registerResearchTaskRoutes = (app: FastifyInstance) => {
  app.get("/research/tasks", async (request) => {
    const auth = getRequiredAuth(request);
    const query = researchTaskQuerySchema.parse(request.query);
    const tasks = await app.services.researchTaskService.list(auth.user.id, query.personId);
    return { tasks };
  });

  app.post("/research/tasks", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const body = createResearchTaskBodySchema.parse(request.body);
    const task = await app.services.researchTaskService.create(auth.user.id, body);
    return reply.code(201).send(task);
  });

  app.patch("/research/tasks/:taskId", async (request) => {
    const auth = getRequiredAuth(request);
    const { taskId } = taskParamsSchema.parse(request.params);
    const body = patchResearchTaskBodySchema.parse(request.body);
    return app.services.researchTaskService.update(auth.user.id, taskId, body);
  });

  app.delete("/research/tasks/:taskId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { taskId } = taskParamsSchema.parse(request.params);
    await app.services.researchTaskService.delete(auth.user.id, taskId);
    return reply.code(204).send();
  });
};
