import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { prisma } from "../db/client.js";
import { lifeEventToJson } from "../lifeEvents/service.js";
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

export type AccountExportPayloadV1 = {
  exportVersion: 1;
  exportedAt: string;
  treemichUser: unknown;
  linkedImmichAccount: unknown;
  personProfiles: unknown[];
  relationships: unknown[];
  places: unknown[];
  lifeEvents: unknown[];
  personNames: unknown[];
  researchTasks: unknown[];
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

    const [
      user,
      personProfiles,
      relationships,
      places,
      lifeEvents,
      personNames,
      researchTasks,
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
      prisma.place.findMany({ where: { userId } }),
      prisma.lifeEvent.findMany({
        where: { userId },
        include: { place: true, citations: true }
      }),
      prisma.personName.findMany({ where: { userId } }),
      prisma.researchTask.findMany({ where: { userId } }),
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
      places,
      lifeEvents: lifeEvents.map((row) => lifeEventToJson(row)),
      personNames,
      researchTasks,
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
