/**
 * @file Registers `GET /export/gedcom` — Phase 5a GEDCOM 5.5.1 export (UTF-8) + optional ZIP with xref sidecar.
 */

import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { isGedcomExportEnabled } from "../config/env.js";
import { prisma } from "../db/client.js";
import { loadGedcomExportInput } from "../gedcom/loadExportInput.js";
import { buildGedcomDocument } from "../gedcom/writer.js";
import { buildGedcomZipManifestV1, zipGedcomExport } from "./export-gedcom.zip.js";
import { EXPENSIVE_ROUTE_RATE_LIMIT } from "./rate-limit.js";

const truthyQuery = (v: string | undefined): boolean =>
  v === "1" || v === "true" || v === "yes" || v === "on";

const falsyQuery = (v: string | undefined): boolean =>
  v === "0" || v === "false" || v === "no" || v === "off";

export const registerExportGedcomGetRoute = (app: FastifyInstance) => {
  if (!isGedcomExportEnabled()) {
    return;
  }

  app.get("/export/gedcom", { config: { rateLimit: EXPENSIVE_ROUTE_RATE_LIMIT } }, async (request, reply) => {
    const q = request.query as {
      format?: string;
      redactLiving?: string;
      includeTreemichCustomTags?: string;
    };
    const formatRaw = q.format;
    const format =
      formatRaw === "zip" ? "zip" : formatRaw === undefined || formatRaw === "ged" ? "ged" : null;
    if (format === null) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Invalid format",
        message: "Use format=ged (default) or format=zip"
      });
    }

    const auth = getRequiredAuth(request);
    const userId = auth.user.id;

    const user = await prisma.treemichUser.findUnique({
      where: { id: userId },
      select: { id: true }
    });
    if (!user) {
      return reply.code(404).send({ statusCode: 404, error: "User not found" });
    }

    const redactLiving = truthyQuery(q.redactLiving);
    const includeTreemichCustomTags = falsyQuery(q.includeTreemichCustomTags) ? false : true;

    const input = await loadGedcomExportInput(userId);
    const exportedAt = new Date().toISOString();
    const { gedcomUtf8, xrefs } = buildGedcomDocument(input, {
      redactLiving,
      includeTreemichCustomTags
    });

    app.log.info(
      { userId, event: "gedcom_export", format, redactLiving },
      "Treemich GEDCOM export downloaded"
    );

    if (format === "ged") {
      return reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="treemich-export-${userId}.ged"`)
        .send(gedcomUtf8);
    }

    const manifest = buildGedcomZipManifestV1(exportedAt);
    const zipBuffer = zipGedcomExport(gedcomUtf8, xrefs, manifest);
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="treemich-gedcom-export-${userId}.zip"`)
      .send(zipBuffer);
  });
};
