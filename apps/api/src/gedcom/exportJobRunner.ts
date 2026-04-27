/**
 * @packageDocumentation
 * Phase 5a: async GEDCOM export job processor (stores UTF-8 result for download).
 */

import { env, maxGedcomImportBytes } from "../config/env.js";
import { prisma } from "../db/client.js";
import { loadGedcomExportInput } from "./loadExportInput.js";
import { buildGedcomDocument } from "./writer.js";

type JobLogger = {
  error: (payload: unknown, message?: string) => void;
};

async function claimGedcomExportJob(jobId: string) {
  const staleBefore = new Date(Date.now() - env.TREEMICH_GEDCOM_JOB_STALE_AFTER_MS);
  const claimed = await prisma.gedcomExportJob.updateMany({
    where: {
      id: jobId,
      OR: [{ status: "PENDING" }, { status: "RUNNING", startedAt: { lt: staleBefore } }]
    },
    data: { status: "RUNNING", startedAt: new Date(), completedAt: null, errorMessage: null }
  });

  if (claimed.count !== 1) {
    return null;
  }

  return prisma.gedcomExportJob.findUnique({ where: { id: jobId } });
}

export async function processGedcomExportJob(jobId: string): Promise<void> {
  const job = await claimGedcomExportJob(jobId);
  if (!job) {
    return;
  }

  try {
    const input = await loadGedcomExportInput(job.userId);
    const { gedcomUtf8 } = buildGedcomDocument(input, {
      redactLiving: job.redactLiving,
      includeTreemichCustomTags: job.includeTreemichCustomTags
    });
    const bytes = Buffer.byteLength(gedcomUtf8, "utf8");
    const cap = maxGedcomImportBytes();
    if (bytes > cap) {
      throw new Error(
        `GEDCOM export is ${bytes} bytes; async job limit is ${cap} bytes (TREEMICH_GEDCOM_IMPORT_MAX_BYTES). Use GET /export/gedcom for immediate download or raise the cap.`
      );
    }
    await prisma.gedcomExportJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        byteSize: bytes,
        gedcomUtf8
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    await prisma.gedcomExportJob.updateMany({
      where: { id: jobId, status: "RUNNING" },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: msg
      }
    });
  }
}

export const scheduleGedcomExportJob = (jobId: string, logger?: JobLogger) => {
  setImmediate(() => {
    void processGedcomExportJob(jobId).catch((err) => {
      logger?.error({ err, jobId }, "GEDCOM export job failed");
    });
  });
};
