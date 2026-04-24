/**
 * @file Phase 5a: async GEDCOM export — `POST /export/gedcom/jobs`, poll `GET …/:jobId`, download `GET …/:jobId/ged`.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";
import { isGedcomExportEnabled } from "../config/env.js";
import { prisma } from "../db/client.js";
import { scheduleGedcomExportJob } from "../gedcom/exportJobRunner.js";

const truthyBody = (v: unknown): boolean =>
  v === true || v === "true" || v === "1" || v === "yes" || v === "on";

const falsyBody = (v: unknown): boolean =>
  v === false || v === "false" || v === "0" || v === "no" || v === "off";

const createJobBodySchema = z.object({
  redactLiving: z.boolean().optional(),
  includeTreemichCustomTags: z.boolean().optional()
});

const jobIdParamsSchema = z.object({
  jobId: z.string().min(1)
});

export const registerExportGedcomJobRoutes = (app: FastifyInstance) => {
  if (!isGedcomExportEnabled()) {
    return;
  }

  app.post<{ Body: z.infer<typeof createJobBodySchema> }>("/export/gedcom/jobs", async (request) => {
    const auth = getRequiredAuth(request);
    const body = createJobBodySchema.parse(request.body ?? {});
    const redactLiving = truthyBody(body.redactLiving);
    const includeTreemichCustomTags = falsyBody(body.includeTreemichCustomTags) ? false : true;

    const job = await prisma.gedcomExportJob.create({
      data: {
        userId: auth.user.id,
        redactLiving,
        includeTreemichCustomTags
      }
    });
    scheduleGedcomExportJob(job.id);

    app.log.info(
      { userId: auth.user.id, event: "gedcom_export_job", jobId: job.id },
      "GEDCOM export job queued"
    );

    return {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt.toISOString()
    };
  });

  app.get("/export/gedcom/jobs/:jobId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { jobId } = jobIdParamsSchema.parse(request.params);
    const job = await prisma.gedcomExportJob.findFirst({
      where: { id: jobId, userId: auth.user.id },
      select: {
        id: true,
        status: true,
        redactLiving: true,
        includeTreemichCustomTags: true,
        byteSize: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        completedAt: true,
        errorMessage: true
      }
    });
    if (!job) {
      return reply.code(404).send({ statusCode: 404, error: "Job not found" });
    }
    return {
      id: job.id,
      status: job.status,
      redactLiving: job.redactLiving,
      includeTreemichCustomTags: job.includeTreemichCustomTags,
      byteSize: job.byteSize,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      errorMessage: job.errorMessage,
      resultPath: job.status === "COMPLETED" ? `/export/gedcom/jobs/${job.id}/ged` : null
    };
  });

  app.get("/export/gedcom/jobs/:jobId/ged", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { jobId } = jobIdParamsSchema.parse(request.params);
    const job = await prisma.gedcomExportJob.findFirst({
      where: { id: jobId, userId: auth.user.id },
      select: { status: true, gedcomUtf8: true }
    });
    if (!job) {
      return reply.code(404).send({ statusCode: 404, error: "Job not found" });
    }
    if (job.status !== "COMPLETED" || !job.gedcomUtf8) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Result not ready",
        message: "Export job is not completed or has no stored GEDCOM payload."
      });
    }
    return reply
      .header("Content-Type", "text/plain; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="treemich-export-${jobId}.ged"`)
      .send(job.gedcomUtf8);
  });
};
