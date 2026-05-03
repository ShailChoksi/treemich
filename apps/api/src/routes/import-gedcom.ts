/**
 * @file Phase 5b: GEDCOM import preview sessions, paged preview rows, and async import jobs (`/import/gedcom/*`).
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getRequiredAuth } from "../auth/request.js";
import { isGedcomImportEnabled, maxGedcomImportBytes, maxGedcomMediaArchiveBytes } from "../config/env.js";
import { prisma } from "../db/client.js";
import { parseGedcomArchive, stageGedcomArchiveMediaFiles } from "../gedcom/archiveImport.js";
import {
  buildGedcomImportPreview,
  capGedcomLineLog,
  enrichGedcomImportPreviewIndis,
  mergeIndiMatches,
  scheduleGedcomImportJob,
  validateFamMatches,
  type GedcomImportPreviewFam,
  type GedcomImportPreviewIndiEnriched,
  type GedcomImportPreviewMedia
} from "../gedcom/importRunner.js";
import { normalizeIndiFamXref } from "../gedcom/parser.js";
import { EXPENSIVE_ROUTE_RATE_LIMIT } from "./rate-limit.js";

const gedcomUtf8Field = z.string().refine(
  (s) => Buffer.byteLength(s, "utf8") <= maxGedcomImportBytes(),
  () => ({ message: `gedcomUtf8 exceeds ${maxGedcomImportBytes()} bytes` })
);

const fromPreviewJobBodySchema = z.object({
  previewId: z.string().min(1),
  indiMatches: z.record(z.string().min(1), z.string().min(1)),
  importOptions: z
    .object({
      dryRun: z.boolean().optional(),
      skipAlreadyImportedIndis: z.boolean().optional(),
      allowPartialMatches: z.boolean().optional(),
      unmatchedIndiPolicy: z.enum(["MATCH_ONLY", "CREATE"]).optional()
    })
    .optional()
});

const jobIdParamsSchema = z.object({
  jobId: z.string().min(1)
});

const previewIdParamsSchema = z.object({
  previewId: z.string().min(1)
});

const indisPageQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  filter: z.enum(["all", "unmatched"]).default("all"),
  q: z.string().optional(),
  matchedXrefs: z.string().optional()
});

const removeStagedArchive = async (stagedArchivePath: string | null) => {
  if (!stagedArchivePath) {
    return;
  }
  try {
    await rm(stagedArchivePath, { force: true });
    await rm(dirname(stagedArchivePath), { force: true, recursive: true });
  } catch {
    // best-effort cleanup
  }
};

const cleanupExpiredPreviewSessions = async () => {
  const expired = await prisma.gedcomImportPreviewSession.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, stagedArchivePath: true }
  });
  for (const row of expired) {
    await removeStagedArchive(row.stagedArchivePath);
  }
  if (expired.length > 0) {
    await prisma.gedcomImportPreviewSession.deleteMany({
      where: { id: { in: expired.map((r) => r.id) } }
    });
  }
};

const parseMatchedXrefs = (raw: string | undefined): Set<string> => {
  const set = new Set<string>();
  if (!raw?.trim()) {
    return set;
  }
  for (const part of raw.split(",")) {
    const nk = normalizeIndiFamXref(part.trim());
    if (nk) {
      set.add(nk);
    }
  }
  return set;
};

const rowSearchBlob = (row: GedcomImportPreviewIndiEnriched): string => {
  const parts: string[] = [
    row.fullName ?? "",
    row.displayName ?? "",
    row.xref,
    row.birthDate ?? "",
    ...row.alternateNames,
    ...row.relatedPeople.flatMap((r) => [r.label, r.name])
  ];
  return parts.join(" ").toLowerCase();
};

const filterIndiRows = (
  rows: GedcomImportPreviewIndiEnriched[],
  opts: {
    filter: "all" | "unmatched";
    q?: string;
    matchedXrefs: Set<string>;
  }
): GedcomImportPreviewIndiEnriched[] => {
  const qTrim = opts.q?.trim().toLowerCase() ?? "";
  const useSearch = qTrim.length >= 2;
  return rows.filter((row) => {
    const nk = normalizeIndiFamXref(row.xref);
    if (opts.filter === "unmatched") {
      const hinted = Boolean(row.personHint?.trim());
      const userMatched = nk ? opts.matchedXrefs.has(nk) : false;
      if (hinted || userMatched) {
        return false;
      }
    }
    if (useSearch && !rowSearchBlob(row).includes(qTrim)) {
      return false;
    }
    return true;
  });
};

const readPreviewMultipartFile = async (request: FastifyRequest) => {
  const file = await request.file({
    limits: {
      fileSize: maxGedcomMediaArchiveBytes(),
      files: 1,
      fields: 8
    }
  });
  if (!file) {
    const err = new Error("Missing GEDCOM .ged or .zip file");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
  const lower = file.filename.toLowerCase();
  const buffer = await file.toBuffer();
  if (lower.endsWith(".ged")) {
    if (buffer.byteLength > maxGedcomImportBytes()) {
      const err = new Error(`GEDCOM file exceeds ${maxGedcomImportBytes()} bytes`);
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }
    return {
      fileName: file.filename,
      isArchive: false as const,
      gedcomUtf8: buffer.toString("utf8"),
      zipBuffer: null as Buffer | null,
      archiveLineLog: [] as Parameters<typeof capGedcomLineLog>[0],
      archiveMediaFiles: [] as { path: string; byteSize: number; mimeType: string | null }[]
    };
  }
  if (lower.endsWith(".zip")) {
    if (buffer.byteLength > maxGedcomMediaArchiveBytes()) {
      const err = new Error(`ZIP archive exceeds ${maxGedcomMediaArchiveBytes()} bytes`);
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }
    const archive = parseGedcomArchive(buffer);
    return {
      fileName: file.filename,
      isArchive: true as const,
      gedcomUtf8: archive.gedcomUtf8,
      zipBuffer: buffer,
      archiveLineLog: archive.lineLog,
      archiveMediaFiles: archive.mediaFiles.map((m) => ({
        path: m.normalizedPath,
        byteSize: m.byteSize,
        mimeType: m.mimeType
      }))
    };
  }
  const err = new Error("Upload must be a .ged (UTF-8) or .zip GEDCOM media bundle");
  (err as Error & { statusCode: number }).statusCode = 400;
  throw err;
};

export const registerImportGedcomRoutes = (app: FastifyInstance) => {
  if (!isGedcomImportEnabled()) {
    return;
  }

  const bodyLimit = Math.min(maxGedcomImportBytes() + 256_000, 6 * 1024 * 1024);

  app.post(
    "/import/gedcom/previews",
    {
      bodyLimit: maxGedcomMediaArchiveBytes() + 256_000,
      config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT }
    },
    async (request) => {
      const auth = getRequiredAuth(request);
      await cleanupExpiredPreviewSessions();
      const upload = await readPreviewMultipartFile(request);
      gedcomUtf8Field.parse(upload.gedcomUtf8);
      const preview = buildGedcomImportPreview(upload.gedcomUtf8);
      const enriched = enrichGedcomImportPreviewIndis(preview);
      const merged = mergeIndiMatches({}, preview.records);
      const famError = validateFamMatches(preview, merged);
      const lineLog = capGedcomLineLog([...upload.archiveLineLog, ...preview.lineLog]);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const sessionId = randomUUID();
      let stagedArchivePath: string | null = null;
      if (upload.isArchive && upload.zipBuffer) {
        const dir = join(tmpdir(), `gedcom-preview-${sessionId}`);
        await mkdir(dir, { recursive: true });
        stagedArchivePath = join(dir, "upload.zip");
        await writeFile(stagedArchivePath, upload.zipBuffer);
      }
      const session = await prisma.gedcomImportPreviewSession.create({
        data: {
          id: sessionId,
          userId: auth.user.id,
          expiresAt,
          fileName: upload.fileName,
          isArchive: upload.isArchive,
          gedcomUtf8: upload.gedcomUtf8,
          stagedArchivePath,
          indiRows: enriched as object,
          fams: preview.fams as object,
          media: preview.media as object,
          archiveMediaFiles: upload.isArchive ? (upload.archiveMediaFiles as object) : undefined,
          lineLog: lineLog as object,
          famMatchError: famError
        }
      });
      const matchedByHint = enriched.filter((r) => Boolean(r.personHint?.trim())).map((r) => r.xref);
      const firstPage = filterIndiRows(enriched, {
        filter: "all",
        matchedXrefs: new Set()
      }).slice(0, 50);
      return {
        previewId: session.id,
        expiresAt: session.expiresAt.toISOString(),
        initialMatchedXrefs: matchedByHint,
        summary: {
          totalIndis: enriched.length,
          totalFams: preview.fams.length,
          totalMedia: preview.media.length,
          matchedByHintCount: matchedByHint.length,
          archiveMediaFileCount: upload.isArchive ? upload.archiveMediaFiles.length : 0,
          famMatchError: famError
        },
        lineLog,
        archiveMediaFiles: upload.isArchive ? upload.archiveMediaFiles : [],
        page: {
          offset: 0,
          limit: 50,
          total: enriched.length,
          rows: firstPage
        }
      };
    }
  );

  app.get("/import/gedcom/previews/:previewId/indis", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { previewId } = previewIdParamsSchema.parse(request.params);
    const query = indisPageQuerySchema.parse(request.query);
    const session = await prisma.gedcomImportPreviewSession.findFirst({
      where: { id: previewId, userId: auth.user.id }
    });
    if (!session) {
      return reply.code(404).send({ statusCode: 404, error: "Preview session not found" });
    }
    if (session.expiresAt < new Date()) {
      await removeStagedArchive(session.stagedArchivePath);
      await prisma.gedcomImportPreviewSession.delete({ where: { id: session.id } }).catch(() => undefined);
      return reply.code(410).send({ statusCode: 410, error: "Preview session expired" });
    }
    const rows = session.indiRows as unknown as GedcomImportPreviewIndiEnriched[];
    const matchedSet = parseMatchedXrefs(query.matchedXrefs);
    const filtered = filterIndiRows(rows, {
      filter: query.filter,
      q: query.q,
      matchedXrefs: matchedSet
    });
    const pageRows = filtered.slice(query.offset, query.offset + query.limit);
    return {
      previewId: session.id,
      offset: query.offset,
      limit: query.limit,
      total: filtered.length,
      rows: pageRows,
      summary: {
        totalIndis: rows.length,
        totalFams: (session.fams as unknown as GedcomImportPreviewFam[]).length,
        totalMedia: (session.media as unknown as GedcomImportPreviewMedia[]).length,
        famMatchError: session.famMatchError
      }
    };
  });

  app.delete("/import/gedcom/previews/:previewId", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { previewId } = previewIdParamsSchema.parse(request.params);
    const session = await prisma.gedcomImportPreviewSession.findFirst({
      where: { id: previewId, userId: auth.user.id }
    });
    if (!session) {
      return reply.code(404).send({ statusCode: 404, error: "Preview session not found" });
    }
    await removeStagedArchive(session.stagedArchivePath);
    await prisma.gedcomImportPreviewSession.delete({ where: { id: session.id } });
    return reply.status(204).send();
  });

  app.post<{ Body: z.infer<typeof fromPreviewJobBodySchema> }>(
    "/import/gedcom/jobs/from-preview",
    { bodyLimit, config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } },
    async (request, reply) => {
      const auth = getRequiredAuth(request);
      const body = fromPreviewJobBodySchema.parse(request.body);
      const session = await prisma.gedcomImportPreviewSession.findFirst({
        where: { id: body.previewId, userId: auth.user.id }
      });
      if (!session) {
        return reply.code(404).send({ statusCode: 404, error: "Preview session not found" });
      }
      if (session.expiresAt < new Date()) {
        await removeStagedArchive(session.stagedArchivePath);
        await prisma.gedcomImportPreviewSession.delete({ where: { id: session.id } }).catch(() => undefined);
        return reply.code(410).send({ statusCode: 410, error: "Preview session expired" });
      }
      const preview = buildGedcomImportPreview(session.gedcomUtf8);
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
      const lineLogSeed = Array.isArray(session.lineLog)
        ? (session.lineLog as Parameters<typeof capGedcomLineLog>[0])
        : [];
      const job = await prisma.gedcomImportJob.create({
        data: {
          userId: auth.user.id,
          fileName: session.fileName,
          byteSize: Buffer.byteLength(session.gedcomUtf8, "utf8"),
          gedcomUtf8: session.gedcomUtf8,
          indiMatches: body.indiMatches as object,
          importOptions: (body.importOptions ?? {}) as object,
          lineLog: capGedcomLineLog([...lineLogSeed, ...preview.lineLog])
        }
      });
      if (session.isArchive && session.stagedArchivePath) {
        const buffer = await readFile(session.stagedArchivePath);
        const archive = parseGedcomArchive(buffer);
        try {
          const staged = await stageGedcomArchiveMediaFiles(job.id, archive.mediaFiles);
          await prisma.gedcomImportJob.update({
            where: { id: job.id },
            data: {
              importOptions: {
                ...(body.importOptions ?? {}),
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
                ...lineLogSeed,
                ...preview.lineLog,
                { severity: "error", lineNo: 0, message }
              ])
            }
          });
          await removeStagedArchive(session.stagedArchivePath);
          await prisma.gedcomImportPreviewSession
            .delete({ where: { id: session.id } })
            .catch(() => undefined);
          throw e;
        }
      }
      scheduleGedcomImportJob(job.id, app.services, app.log);
      await removeStagedArchive(session.stagedArchivePath);
      await prisma.gedcomImportPreviewSession.delete({ where: { id: session.id } });
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
