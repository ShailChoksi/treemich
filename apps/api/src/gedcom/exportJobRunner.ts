/**
 * @packageDocumentation
 * Phase 5a: async GEDCOM export job processor (stores UTF-8 result for download).
 */

import { maxGedcomImportBytes } from "../config/env.js";
import { prisma } from "../db/client.js";
import { loadGedcomExportInput } from "./loadExportInput.js";
import { buildGedcomDocument } from "./writer.js";

export async function processGedcomExportJob(jobId: string): Promise<void> {
  const job = await prisma.gedcomExportJob.findFirst({ where: { id: jobId } });
  if (!job || job.status !== "PENDING") {
    return;
  }

  await prisma.gedcomExportJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() }
  });

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
    await prisma.gedcomExportJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: msg
      }
    });
  }
}

export const scheduleGedcomExportJob = (jobId: string) => {
  setImmediate(() => {
    void processGedcomExportJob(jobId).catch((err) => {
      console.error("GEDCOM export job failed", jobId, err);
    });
  });
};
