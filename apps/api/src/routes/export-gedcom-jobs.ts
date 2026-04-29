/**
 * @file Phase 5a: async GEDCOM export — `POST /export/gedcom/jobs`, poll `GET …/:jobId`, download `GET …/:jobId/ged`.
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";
import { env, isGedcomExportEnabled } from "../config/env.js";
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

const signedDownloadParamsSchema = z.object({
  jobId: z.string().min(1),
  token: z.string().min(1)
});

const EXPORT_DOWNLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

const base64Url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

const signExportDownloadToken = (jobId: string, userId: string, expiresAtMs: number) => {
  const payload = `${jobId}.${userId}.${expiresAtMs}`;
  const sig = createHmac("sha256", env.TREEMICH_ENCRYPTION_KEY).update(payload).digest("base64url");
  return `${base64Url(payload)}.${sig}`;
};

const verifyExportDownloadToken = (
  token: string,
  jobId: string
): { userId: string; expiresAtMs: number } | null => {
  const [payloadEncoded, sig] = token.split(".");
  if (!payloadEncoded || !sig) {
    return null;
  }
  let payload: string;
  try {
    payload = Buffer.from(payloadEncoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [tokenJobId, userId, expiresAtRaw] = payload.split(".");
  const expiresAtMs = Number(expiresAtRaw);
  if (tokenJobId !== jobId || !userId || !Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return null;
  }
  const expected = createHmac("sha256", env.TREEMICH_ENCRYPTION_KEY).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }
  return { userId, expiresAtMs };
};

const sendGedcomResult = (reply: FastifyReply, jobId: string, gedcomUtf8: string) =>
  reply
    .header("Content-Type", "text/plain; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="treemich-export-${jobId}.ged"`)
    .send(gedcomUtf8);

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
    scheduleGedcomExportJob(job.id, app.log);

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
    const expiresAtMs = Date.now() + EXPORT_DOWNLOAD_TOKEN_TTL_MS;
    const token =
      job.status === "COMPLETED" ? signExportDownloadToken(job.id, auth.user.id, expiresAtMs) : null;
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
      resultPath: job.status === "COMPLETED" ? `/export/gedcom/jobs/${job.id}/ged` : null,
      downloadUrl: token ? `/export/gedcom/jobs/${job.id}/ged/${token}` : null,
      downloadTokenExpiresAt: token ? new Date(expiresAtMs).toISOString() : null
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
    return sendGedcomResult(reply, jobId, job.gedcomUtf8);
  });

  app.get("/export/gedcom/jobs/:jobId/ged/:token", async (request, reply) => {
    const { jobId, token } = signedDownloadParamsSchema.parse(request.params);
    const verified = verifyExportDownloadToken(token, jobId);
    if (!verified) {
      return reply.code(403).send({ statusCode: 403, error: "Invalid or expired export download token" });
    }
    const job = await prisma.gedcomExportJob.findFirst({
      where: { id: jobId, userId: verified.userId },
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
    return sendGedcomResult(reply, jobId, job.gedcomUtf8);
  });
};
