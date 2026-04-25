/**
 * @file Registers `GET /export/account` — JSON (+ manifest) account export for GDPR-style portability.
 */

import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { env } from "../config/env.js";
import { prisma } from "../db/client.js";
import { lifeEventQueryInclude, lifeEventToJson } from "../lifeEvents/service.js";
import { familyToJson } from "../families/service.js";
import { buildAccountExportManifestV1, zipAccountExport } from "./export-account.zip.js";

const serializeForExport = (value: unknown) =>
  JSON.stringify(value, (_key, v) => {
    if (v instanceof Date) {
      return v.toISOString();
    }
    if (
      v != null &&
      typeof v === "object" &&
      "toNumber" in v &&
      typeof (v as { toNumber: () => number }).toNumber === "function"
    ) {
      return (v as { toNumber: () => number }).toNumber();
    }
    return v;
  });

const countExportRows = async (userId: string) => {
  const counts = await Promise.all([
    prisma.personProfile.count({ where: { userId } }),
    prisma.relationship.count({ where: { userId } }),
    prisma.family.count({ where: { userId } }),
    prisma.place.count({ where: { userId } }),
    prisma.lifeEvent.count({ where: { userId } }),
    prisma.personName.count({ where: { userId } }),
    prisma.researchTask.count({ where: { userId } }),
    prisma.repository.count({ where: { userId } }),
    prisma.source.count({ where: { userId } }),
    prisma.mediaObject.count({ where: { userId } }),
    prisma.mediaLink.count({ where: { userId } }),
    prisma.treemichSession.count({ where: { userId } }),
    prisma.cooccurrenceJob.count({ where: { userId } }),
    prisma.cooccurrenceEdge.count({ where: { userId } })
  ]);
  return counts.reduce((total, count) => total + count, 0);
};

export type AccountExportPayloadV1 = {
  exportVersion: 1;
  exportedAt: string;
  treemichUser: unknown;
  linkedImmichAccount: unknown;
  personProfiles: unknown[];
  relationships: unknown[];
  /** Phase 4: FAM-style unions with children and pedigree (nested `children`). */
  families: unknown[];
  places: unknown[];
  lifeEvents: unknown[];
  personNames: unknown[];
  researchTasks: unknown[];
  repositories: unknown[];
  sources: unknown[];
  mediaObjects: unknown[];
  mediaLinks: unknown[];
  treemichSessions: unknown[];
  cooccurrenceJobs: unknown[];
  cooccurrenceEdges: unknown[];
  cooccurrenceSchedule: unknown;
};

export const registerExportAccountGetRoute = (app: FastifyInstance) => {
  app.get("/export/account", async (request, reply) => {
    const formatRaw = (request.query as { format?: string }).format;
    const format =
      formatRaw === "zip" ? "zip" : formatRaw === undefined || formatRaw === "json" ? "json" : null;
    if (format === null) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Invalid format",
        message: "Use format=json (default) or format=zip"
      });
    }

    const auth = getRequiredAuth(request);
    const userId = auth.user.id;
    const exportRowCount = await countExportRows(userId);
    if (exportRowCount > env.TREEMICH_EXPORT_MAX_ROWS) {
      return reply.code(413).send({
        statusCode: 413,
        error: "Export Too Large",
        message: `This account export contains ${exportRowCount} rows, exceeding TREEMICH_EXPORT_MAX_ROWS=${env.TREEMICH_EXPORT_MAX_ROWS}. Use a background export path or raise the limit.`
      });
    }

    const [
      user,
      personProfiles,
      relationships,
      familyRows,
      places,
      lifeEvents,
      personNames,
      researchTasks,
      repositories,
      sources,
      mediaObjects,
      mediaLinks,
      sessions,
      linkedAccount,
      cooccurrenceJobs,
      cooccurrenceEdges,
      cooccurrenceSchedule
    ] = await Promise.all([
      prisma.treemichUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
          immichBaseUrl: true,
          immichUserId: true,
          immichEmail: true,
          immichName: true,
          preferences: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.personProfile.findMany({ where: { userId } }),
      prisma.relationship.findMany({ where: { userId } }),
      prisma.family.findMany({
        where: { userId },
        include: { children: true },
        orderBy: { id: "asc" }
      }),
      prisma.place.findMany({ where: { userId } }),
      prisma.lifeEvent.findMany({
        where: { userId },
        include: lifeEventQueryInclude
      }),
      prisma.personName.findMany({ where: { userId } }),
      prisma.researchTask.findMany({ where: { userId } }),
      prisma.repository.findMany({ where: { userId } }),
      prisma.source.findMany({ where: { userId }, include: { repository: true } }),
      prisma.mediaObject.findMany({ where: { userId } }),
      prisma.mediaLink.findMany({ where: { userId } }),
      prisma.treemichSession.findMany({
        where: { userId },
        select: {
          id: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.linkedImmichAccount.findUnique({
        where: { userId },
        select: {
          id: true,
          immichBaseUrl: true,
          immichUserId: true,
          immichEmail: true,
          immichName: true,
          accessTokenExpiresAt: true,
          lastValidatedAt: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.cooccurrenceJob.findMany({ where: { userId } }),
      prisma.cooccurrenceEdge.findMany({ where: { userId } }),
      prisma.cooccurrenceSchedule.findUnique({ where: { userId } })
    ]);

    if (!user) {
      return reply.code(404).send({ statusCode: 404, error: "User not found" });
    }

    const payload: AccountExportPayloadV1 = {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      treemichUser: user,
      linkedImmichAccount: linkedAccount,
      personProfiles,
      relationships,
      families: familyRows.map((row) => familyToJson(row)),
      places,
      lifeEvents: lifeEvents.map((row) => lifeEventToJson(row)),
      personNames,
      researchTasks,
      repositories,
      sources,
      mediaObjects,
      mediaLinks,
      treemichSessions: sessions,
      cooccurrenceJobs,
      cooccurrenceEdges,
      cooccurrenceSchedule
    };

    app.log.info({ userId, event: "account_export", format }, "Treemich account export downloaded");

    const jsonBody = serializeForExport(payload);

    if (format === "json") {
      return reply
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="treemich-account-export-${userId}.json"`)
        .send(jsonBody);
    }

    const manifest = buildAccountExportManifestV1({
      exportVersion: payload.exportVersion,
      exportedAt: payload.exportedAt
    });
    const zipBuffer = zipAccountExport(jsonBody, manifest);
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="treemich-account-export-${userId}.zip"`)
      .send(zipBuffer);
  });
};
