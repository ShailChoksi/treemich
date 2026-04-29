/**
 * @file Registers `GET /export/account` — JSON (+ manifest) account export for GDPR-style portability.
 */

import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { getRequiredAuth } from "../auth/request.js";
import { env } from "../config/env.js";
import { prisma } from "../db/client.js";
import { lifeEventQueryInclude, lifeEventToJson } from "../lifeEvents/service.js";
import { familyToJson } from "../families/service.js";
import { pathForStorageKey, storageKeyFromUrl } from "../evidence/mediaStorage.js";
import {
  buildAccountExportManifestV1,
  type AccountExportZipFile,
  zipAccountExport
} from "./export-account.zip.js";

const manifestFileFromZipFile = ({ path, role, personId, personThumbnailId }: AccountExportZipFile) => ({
  path,
  role,
  ...(personId ? { personId } : {}),
  ...(personThumbnailId ? { personThumbnailId } : {})
});

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
    prisma.personExternalIdentity.count({ where: { userId } }),
    prisma.personThumbnail.count({ where: { userId } }),
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

export type AccountExportPayloadV2 = Omit<AccountExportPayloadV1, "exportVersion" | "personProfiles"> & {
  exportVersion: 2;
  people: unknown[];
  personExternalIdentities: unknown[];
  personThumbnails: unknown[];
};

const safeZipPathSegment = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, "_");

const buildThumbnailBinaryFiles = async (
  thumbnails: Array<{ id: string; personId: string; storageUrl: string | null }>
): Promise<{
  thumbnails: Array<Record<string, unknown>>;
  files: AccountExportZipFile[];
}> => {
  const files: AccountExportZipFile[] = [];
  const exportedThumbnails: Array<Record<string, unknown>> = [];
  for (const thumbnail of thumbnails) {
    const exportRow: Record<string, unknown> = { ...thumbnail };
    const storageKey = thumbnail.storageUrl ? storageKeyFromUrl(thumbnail.storageUrl) : null;
    if (storageKey) {
      const path = `thumbnails/${safeZipPathSegment(thumbnail.personId)}/${safeZipPathSegment(thumbnail.id)}-${safeZipPathSegment(storageKey)}`;
      try {
        files.push({
          path,
          role: "person_thumbnail_binary",
          personId: thumbnail.personId,
          personThumbnailId: thumbnail.id,
          data: await readFile(pathForStorageKey(storageKey))
        });
        exportRow.exportBinaryPath = path;
      } catch {
        exportRow.exportBinaryMissing = true;
      }
    }
    exportedThumbnails.push(exportRow);
  }
  return { thumbnails: exportedThumbnails, files };
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

    const versionRaw = (request.query as { version?: string }).version;
    const version = versionRaw === "1" ? 1 : versionRaw === undefined || versionRaw === "2" ? 2 : null;
    if (version === null) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Invalid version",
        message: "Use version=1 or version=2 (default)"
      });
    }

    const [
      user,
      people,
      personExternalIdentities,
      personThumbnails,
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
          email: true,
          name: true,
          preferences: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.personProfile.findMany({ where: { userId } }),
      prisma.personExternalIdentity.findMany({
        where: { userId },
        orderBy: [{ personId: "asc" }, { createdAt: "asc" }]
      }),
      prisma.personThumbnail.findMany({
        where: { userId },
        orderBy: [{ personId: "asc" }, { createdAt: "asc" }]
      }),
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

    const { thumbnails: exportedPersonThumbnails, files: thumbnailFiles } =
      await buildThumbnailBinaryFiles(personThumbnails);

    const payloadBase = {
      exportedAt: new Date().toISOString(),
      treemichUser: user,
      linkedImmichAccount: linkedAccount,
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

    const payload: AccountExportPayloadV1 | AccountExportPayloadV2 =
      version === 1
        ? {
            exportVersion: 1,
            ...payloadBase,
            personProfiles: people
          }
        : {
            exportVersion: 2,
            ...payloadBase,
            people,
            personExternalIdentities,
            personThumbnails: exportedPersonThumbnails
          };

    app.log.info({ userId, event: "account_export", format }, "Treemich account export downloaded");

    const jsonBody = serializeForExport(payload);

    if (format === "json") {
      return reply
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="treemich-account-export-${userId}.json"`)
        .send(jsonBody);
    }

    const extraZipFiles = version === 2 ? thumbnailFiles : [];
    const manifest = buildAccountExportManifestV1({
      exportVersion: payload.exportVersion,
      exportedAt: payload.exportedAt,
      extraFiles: extraZipFiles.map(manifestFileFromZipFile)
    });
    const zipBuffer = zipAccountExport(jsonBody, manifest, extraZipFiles);
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="treemich-account-export-${userId}.zip"`)
      .send(zipBuffer);
  });
};
