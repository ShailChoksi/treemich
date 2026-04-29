/**
 * @file Phase 5b: GEDCOM import preview, job creation, and job status polling (`/import/gedcom/*`).
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";
import { isGedcomImportEnabled, maxGedcomImportBytes, maxGedcomMediaArchiveBytes } from "../config/env.js";
import { prisma } from "../db/client.js";
import { parseGedcomArchive, stageGedcomArchiveMediaFiles } from "../gedcom/archiveImport.js";
import {
  buildGedcomImportPreview,
  capGedcomLineLog,
  mergeIndiMatches,
  scheduleGedcomImportJob,
  validateFamMatches
} from "../gedcom/importRunner.js";
import { EXPENSIVE_ROUTE_RATE_LIMIT } from "./rate-limit.js";

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
  /** Map GEDCOM INDI xref (`@I1@` or `I1`) → Treemich PersonProfile id for this user. */
  indiMatches: z.record(z.string().min(1), z.string().min(1)),
  importOptions: z
    .object({
      dryRun: z.boolean().optional(),
      skipAlreadyImportedIndis: z.boolean().optional(),
      /** When true, allows importing only a matched INDI subset; FAM rows with missing matches are skipped. */
      allowPartialMatches: z.boolean().optional(),
      /**
       * Controls what happens to INDI records that have no existing Treemich person match:
       * - "MATCH_ONLY" (default): unmatched INDI rows are skipped with a warning.
       * - "CREATE": unmatched INDI rows are created as new Treemich persons before family/life-event processing.
       */
      unmatchedIndiPolicy: z.enum(["MATCH_ONLY", "CREATE"]).optional()
    })
    .optional()
});

const jobIdParamsSchema = z.object({
  jobId: z.string().min(1)
});

const multipartFieldValue = (raw: unknown): string | undefined => {
  if (typeof raw === "string") {
    return raw;
  }
  if (
    raw &&
    typeof raw === "object" &&
    "value" in raw &&
    typeof (raw as { value?: unknown }).value === "string"
  ) {
    return (raw as { value: string }).value;
  }
  return undefined;
};

const parseJsonField = <T>(raw: unknown, schema: z.ZodType<T>, fallback: T): T => {
  const value = multipartFieldValue(raw);
  if (!value?.trim()) {
    return fallback;
  }
  return schema.parse(JSON.parse(value));
};

const readArchiveUpload = async (request: FastifyRequest) => {
  const file = await request.file();
  if (!file) {
    const err = new Error("Missing archive file");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
  if (!file.filename.toLowerCase().endsWith(".zip")) {
    const err = new Error("GEDCOM media import requires a .zip archive");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
  const buffer = await file.toBuffer();
  return {
    fileName: file.filename,
    archive: parseGedcomArchive(buffer),
    byteSize: buffer.byteLength,
    fields: file.fields
  };
};

export const registerImportGedcomRoutes = (app: FastifyInstance) => {
  if (!isGedcomImportEnabled()) {
    return;
  }

  const bodyLimit = Math.min(maxGedcomImportBytes() + 256_000, 6 * 1024 * 1024);

  app.post<{ Body: z.infer<typeof previewBodySchema> }>(
    "/import/gedcom/preview",
    { bodyLimit, config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } },
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
          personHint: i.personHint
        }));
      const famError = validateFamMatches(preview, merged);
      return {
        indis: preview.indis,
        fams: preview.fams,
        media: preview.media,
        archiveMediaFiles: [],
        unmatchedIndis: unmatched,
        unmatchedIndiPolicy: "MATCH_ONLY",
        famMatchError: famError,
        lineLog: capGedcomLineLog(preview.lineLog),
        userId: auth.user.id
      };
    }
  );

  app.post(
    "/import/gedcom/preview/archive",
    {
      bodyLimit: maxGedcomMediaArchiveBytes() + 256_000,
      config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT }
    },
    async (request) => {
      const auth = getRequiredAuth(request);
      const { archive } = await readArchiveUpload(request);
      const preview = buildGedcomImportPreview(archive.gedcomUtf8);
      const merged = mergeIndiMatches({}, preview.records);
      const unmatched = preview.indis
        .filter((i) => !merged.get(i.xref))
        .map((i) => ({
          xref: i.xref,
          displayName: i.displayName,
          personHint: i.personHint
        }));
      const famError = validateFamMatches(preview, merged);
      return {
        indis: preview.indis,
        fams: preview.fams,
        media: preview.media,
        archiveMediaFiles: archive.mediaFiles.map((m) => ({
          path: m.normalizedPath,
          byteSize: m.byteSize,
          mimeType: m.mimeType
        })),
        unmatchedIndis: unmatched,
        unmatchedIndiPolicy: "MATCH_ONLY",
        famMatchError: famError,
        lineLog: capGedcomLineLog([...archive.lineLog, ...preview.lineLog]),
        userId: auth.user.id
      };
    }
  );

  app.post<{ Body: z.infer<typeof createJobBodySchema> }>(
    "/import/gedcom/jobs",
    { bodyLimit, config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } },
    async (request, reply) => {
      const auth = getRequiredAuth(request);
      const body = createJobBodySchema.parse(request.body);
      const preview = buildGedcomImportPreview(body.gedcomUtf8);
      const merged = mergeIndiMatches(body.indiMatches, preview.records);
      const famErr = validateFamMatches(preview, merged);
      const allowPartialMatches = body.importOptions?.allowPartialMatches === true;
      const createPolicy = body.importOptions?.unmatchedIndiPolicy === "CREATE";
      if (famErr && !allowPartialMatches && !createPolicy) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Incomplete INDI matches for family records",
          message: `${famErr}. Set importOptions.unmatchedIndiPolicy="CREATE" to create new people automatically, or set importOptions.allowPartialMatches=true to skip unmatched families.`
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
          lineLog: capGedcomLineLog(preview.lineLog)
        }
      });
      scheduleGedcomImportJob(job.id, app.services, app.log);
      return {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt.toISOString()
      };
    }
  );

  app.post(
    "/import/gedcom/jobs/archive",
    {
      bodyLimit: maxGedcomMediaArchiveBytes() + 256_000,
      config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT }
    },
    async (request, reply) => {
      const auth = getRequiredAuth(request);
      const { fileName, archive, byteSize, fields } = await readArchiveUpload(request);
      const indiMatches = parseJsonField(
        fields.indiMatches,
        z.record(z.string().min(1), z.string().min(1)),
        {}
      );
      const importOptions = parseJsonField(
        fields.importOptions,
        createJobBodySchema.shape.importOptions.unwrap(),
        {}
      );
      const preview = buildGedcomImportPreview(archive.gedcomUtf8);
      const merged = mergeIndiMatches(indiMatches, preview.records);
      const famErr = validateFamMatches(preview, merged);
      const allowPartialMatches = importOptions.allowPartialMatches === true;
      const createPolicy = importOptions.unmatchedIndiPolicy === "CREATE";
      if (famErr && !allowPartialMatches && !createPolicy) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Incomplete INDI matches for family records",
          message: `${famErr}. Set importOptions.unmatchedIndiPolicy="CREATE" to create new people automatically, or set importOptions.allowPartialMatches=true to skip unmatched families.`
        });
      }
      const job = await prisma.gedcomImportJob.create({
        data: {
          userId: auth.user.id,
          fileName,
          byteSize,
          gedcomUtf8: archive.gedcomUtf8,
          indiMatches: indiMatches as object,
          importOptions: importOptions as object,
          lineLog: capGedcomLineLog([...archive.lineLog, ...preview.lineLog])
        }
      });
      try {
        const staged = await stageGedcomArchiveMediaFiles(job.id, archive.mediaFiles);
        await prisma.gedcomImportJob.update({
          where: { id: job.id },
          data: {
            importOptions: {
              ...importOptions,
              mediaArchive: staged
            } as object
          }
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to stage GEDCOM media archive";
        await prisma.gedcomImportJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage: message,
            lineLog: capGedcomLineLog([
              ...archive.lineLog,
              ...preview.lineLog,
              { severity: "error", lineNo: 0, message }
            ])
          }
        });
        throw e;
      }
      scheduleGedcomImportJob(job.id, app.services, app.log);
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
        ? capGedcomLineLog(job.lineLog as Parameters<typeof capGedcomLineLog>[0])
        : []
    };
  });
};
