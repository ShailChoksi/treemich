/**
 * @file Registers `GET /export/gedcom` — Phase 5a GEDCOM 5.5.1 export (UTF-8) + optional ZIP with xref sidecar.
 */

import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { isGedcomExportEnabled } from "../config/env.js";
import { prisma } from "../db/client.js";
import { lifeEventQueryInclude } from "../lifeEvents/service.js";
import { buildGedcomDocument, type GedcomExportInput } from "../gedcom/writer.js";
import { buildGedcomZipManifestV1, zipGedcomExport } from "./export-gedcom.zip.js";

const truthyQuery = (v: string | undefined): boolean =>
  v === "1" || v === "true" || v === "yes" || v === "on";

const falsyQuery = (v: string | undefined): boolean =>
  v === "0" || v === "false" || v === "no" || v === "off";

const mapPlace = (
  p:
    | {
        id: string;
        name: string;
        addressLine1: string | null;
        locality: string | null;
        adminArea: string | null;
        postalCode: string | null;
        countryCode: string | null;
        latitude: unknown;
        longitude: unknown;
        notes: string | null;
      }
    | null
    | undefined
): GedcomExportInput["lifeEvents"][number]["place"] => {
  if (!p) {
    return null;
  }
  return {
    id: p.id,
    name: p.name,
    addressLine1: p.addressLine1,
    locality: p.locality,
    adminArea: p.adminArea,
    postalCode: p.postalCode,
    countryCode: p.countryCode,
    latitude: p.latitude != null ? Number(p.latitude) : null,
    longitude: p.longitude != null ? Number(p.longitude) : null,
    notes: p.notes
  };
};

const loadGedcomExportInput = async (userId: string): Promise<GedcomExportInput> => {
  const [
    personProfiles,
    relationships,
    familyRows,
    lifeEvents,
    personNames,
    repositories,
    sources,
    mediaObjects,
    mediaLinks
  ] = await Promise.all([
    prisma.personProfile.findMany({ where: { userId } }),
    prisma.relationship.findMany({ where: { userId } }),
    prisma.family.findMany({
      where: { userId },
      include: { children: true },
      orderBy: { id: "asc" }
    }),
    prisma.lifeEvent.findMany({
      where: { userId },
      include: lifeEventQueryInclude
    }),
    prisma.personName.findMany({ where: { userId } }),
    prisma.repository.findMany({ where: { userId } }),
    prisma.source.findMany({ where: { userId } }),
    prisma.mediaObject.findMany({ where: { userId } }),
    prisma.mediaLink.findMany({ where: { userId } })
  ]);

  const externalIdsList = personProfiles.map((p) => ({
    ...p,
    externalIds:
      p.externalIds != null && typeof p.externalIds === "object" && !Array.isArray(p.externalIds)
        ? (p.externalIds as Record<string, unknown>)
        : {}
  }));

  return {
    personProfiles: externalIdsList,
    relationships: relationships.map((r) => ({
      id: r.id,
      fromPersonId: r.fromPersonId,
      toPersonId: r.toPersonId,
      type: r.type,
      familyId: r.familyId
    })),
    families: familyRows.map((f) => ({
      id: f.id,
      parent1ImmichPersonId: f.parent1ImmichPersonId,
      parent2ImmichPersonId: f.parent2ImmichPersonId,
      notes: f.notes,
      children: f.children.map((c) => ({
        childImmichPersonId: c.childImmichPersonId,
        pedigree: c.pedigree
      }))
    })),
    lifeEvents: lifeEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      customLabel: e.customLabel,
      dateQualifier: e.dateQualifier,
      year: e.year,
      month: e.month,
      day: e.day,
      endYear: e.endYear,
      endMonth: e.endMonth,
      endDay: e.endDay,
      personProfileId: e.personProfileId,
      relationshipId: e.relationshipId,
      familyId: e.familyId,
      notes: e.notes,
      place: mapPlace(e.place),
      citations: e.citations.map((c) => ({
        id: c.id,
        sourceId: c.sourceId,
        page: c.page,
        notes: c.notes
      }))
    })),
    personNames,
    repositories,
    sources: sources.map((s) => ({
      id: s.id,
      repositoryId: s.repositoryId,
      title: s.title,
      author: s.author,
      publication: s.publication,
      url: s.url,
      notes: s.notes
    })),
    mediaObjects: mediaObjects.map((m) => ({
      id: m.id,
      storageUrl: m.storageUrl,
      mimeType: m.mimeType,
      title: m.title
    })),
    mediaLinks: mediaLinks.map((l) => ({
      mediaObjectId: l.mediaObjectId,
      targetType: l.targetType,
      targetId: l.targetId
    }))
  };
};

export const registerExportGedcomGetRoute = (app: FastifyInstance) => {
  if (!isGedcomExportEnabled()) {
    return;
  }

  app.get("/export/gedcom", async (request, reply) => {
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
