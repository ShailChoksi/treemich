/**
 * @packageDocumentation
 * Loads Treemich user graph data for GEDCOM 5.5.1 export (`buildGedcomDocument`). Shared by synchronous export and async export jobs.
 */

import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { lifeEventQueryInclude } from "../lifeEvents/service.js";
import type { GedcomExportInput } from "./writer.js";

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

export const loadGedcomExportInput = async (userId: string): Promise<GedcomExportInput> => {
  const exportRowCount = (
    await Promise.all([
      prisma.personProfile.count({ where: { userId } }),
      prisma.relationship.count({ where: { userId } }),
      prisma.family.count({ where: { userId } }),
      prisma.lifeEvent.count({ where: { userId } }),
      prisma.personName.count({ where: { userId } }),
      prisma.repository.count({ where: { userId } }),
      prisma.source.count({ where: { userId } }),
      prisma.mediaObject.count({ where: { userId } }),
      prisma.mediaLink.count({ where: { userId } })
    ])
  ).reduce((total, count) => total + count, 0);
  if (exportRowCount > env.TREEMICH_EXPORT_MAX_ROWS) {
    throw new Error(
      `GEDCOM export contains ${exportRowCount} rows, exceeding TREEMICH_EXPORT_MAX_ROWS=${env.TREEMICH_EXPORT_MAX_ROWS}. Use a filtered export or raise the limit.`
    );
  }

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
      externalIds:
        f.externalIds != null && typeof f.externalIds === "object" && !Array.isArray(f.externalIds)
          ? (f.externalIds as Record<string, unknown>)
          : {},
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
