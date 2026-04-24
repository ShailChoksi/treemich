/**
 * @file Phase 5b: GEDCOM import preview, job creation, and job status polling (`/import/gedcom/*`).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";
import { isGedcomImportEnabled, maxGedcomImportBytes, maxGedcomImportLineLogEntries } from "../config/env.js";
import { prisma } from "../db/client.js";
import {
  buildGedcomImportPreview,
  mergeIndiMatches,
  scheduleGedcomImportJob,
  validateFamMatches
} from "../gedcom/importRunner.js";

const gedcomUtf8Field = z.string().refine(
  (s) => Buffer.byteLength(s, "utf8") <= maxGedcomImportBytes(),
  () => ({ message: `gedcomUtf8 exceeds ${maxGedcomImportBytes()} bytes` })
);

const previewBodySchema = z.object({
  gedcomUtf8: gedcomUtf8Field
});

const createJobBodySchema = z.object({
  gedcomUtf8: gedcomUtf8Field,
  fileName: z.string().max(255).optional(),
  /** Map GEDCOM INDI xref (`@I1@` or `I1`) → Immich person id (must exist as a Treemich profile for this user). */
  indiMatches: z.record(z.string().min(1), z.string().min(1)),
  importOptions: z
    .object({
      dryRun: z.boolean().optional(),
      skipAlreadyImportedIndis: z.boolean().optional(),
      /** When true, allows importing only a matched INDI subset; FAM rows with missing matches are skipped. */
      allowPartialMatches: z.boolean().optional()
    })
    .optional()
});

const jobIdParamsSchema = z.object({
  jobId: z.string().min(1)
});

export const registerImportGedcomRoutes = (app: FastifyInstance) => {
  if (!isGedcomImportEnabled()) {
    return;
  }

  const bodyLimit = Math.min(maxGedcomImportBytes() + 256_000, 6 * 1024 * 1024);

  app.post<{ Body: z.infer<typeof previewBodySchema> }>(
    "/import/gedcom/preview",
    { bodyLimit },
    async (request) => {
      const auth = getRequiredAuth(request);
      const body = previewBodySchema.parse(request.body);
      const preview = buildGedcomImportPreview(body.gedcomUtf8);
      const merged = mergeIndiMatches({}, preview.records);
      const unmatched = preview.indis
        .filter((i) => !merged.get(i.xref))
        .map((i) => ({
          xref: i.xref,
          displayName: i.displayName,
          immichHint: i.immichHint
        }));
      const famError = validateFamMatches(preview, merged);
      return {
        indis: preview.indis,
        fams: preview.fams,
        unmatchedIndis: unmatched,
        famMatchError: famError,
        lineLog: preview.lineLog.slice(0, maxGedcomImportLineLogEntries()),
        userId: auth.user.id
      };
    }
  );

  app.post<{ Body: z.infer<typeof createJobBodySchema> }>(
    "/import/gedcom/jobs",
    { bodyLimit },
    async (request, reply) => {
      const auth = getRequiredAuth(request);
      const body = createJobBodySchema.parse(request.body);
      const preview = buildGedcomImportPreview(body.gedcomUtf8);
      const merged = mergeIndiMatches(body.indiMatches, preview.records);
      const famErr = validateFamMatches(preview, merged);
      const allowPartialMatches = body.importOptions?.allowPartialMatches === true;
      if (famErr && !allowPartialMatches) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Incomplete INDI matches for family records",
          message: `${famErr}. To import only matched people, set importOptions.allowPartialMatches=true.`
        });
      }
      const job = await prisma.gedcomImportJob.create({
        data: {
          userId: auth.user.id,
          fileName: body.fileName ?? "import.ged",
          byteSize: Buffer.byteLength(body.gedcomUtf8, "utf8"),
          gedcomUtf8: body.gedcomUtf8,
          indiMatches: body.indiMatches as object,
          importOptions: (body.importOptions ?? {}) as object,
          lineLog: preview.lineLog.slice(0, maxGedcomImportLineLogEntries())
        }
      });
      scheduleGedcomImportJob(job.id, app.services);
      return {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt.toISOString()
      };
    }
  );

  app.get("/import/gedcom/jobs/:jobId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { jobId } = jobIdParamsSchema.parse(request.params);
    const job = await prisma.gedcomImportJob.findFirst({
      where: { id: jobId, userId: auth.user.id }
    });
    if (!job) {
      return reply.code(404).send({ statusCode: 404, error: "Job not found" });
    }
    return {
      id: job.id,
      status: job.status,
      fileName: job.fileName,
      byteSize: job.byteSize,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      errorMessage: job.errorMessage,
      summary: job.summary,
      lineLog: Array.isArray(job.lineLog)
        ? (job.lineLog as unknown[]).slice(0, maxGedcomImportLineLogEntries())
        : []
    };
  });
};
