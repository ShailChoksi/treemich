import type {
  CreateMediaLinkBody,
  CreateMediaObjectBody,
  CreateRepositoryBody,
  CreateSourceBody,
  MediaLinkRecord,
  MediaLinkTargetType,
  MediaObjectRecord,
  PatchMediaObjectBody,
  PatchRepositoryBody,
  PatchSourceBody,
  RepositoryRecord,
  SourceRecord,
  TargetMediaLinkRecord
} from "@treemich/shared";
import { prisma } from "../db/client.js";

const toRepositoryJson = (row: {
  id: string;
  name: string;
  addressLine1: string | null;
  url: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RepositoryRecord => ({
  id: row.id,
  name: row.name,
  addressLine1: row.addressLine1,
  url: row.url,
  notes: row.notes,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

const toSourceJson = (
  row: {
    id: string;
    repositoryId: string | null;
    title: string;
    author: string | null;
    publication: string | null;
    url: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  repository?: {
    id: string;
    name: string;
    addressLine1: string | null;
    url: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null
): SourceRecord => ({
  id: row.id,
  repositoryId: row.repositoryId,
  title: row.title,
  author: row.author,
  publication: row.publication,
  url: row.url,
  notes: row.notes,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  repository: repository ? toRepositoryJson(repository) : repository === null ? null : undefined
});

const toMediaObjectJson = (row: {
  id: string;
  storageUrl: string;
  mimeType: string | null;
  checksum: string | null;
  immichAssetId: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MediaObjectRecord => ({
  id: row.id,
  storageUrl: row.storageUrl,
  mimeType: row.mimeType,
  checksum: row.checksum,
  immichAssetId: row.immichAssetId,
  title: row.title,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

const toMediaLinkJson = (row: {
  id: string;
  mediaObjectId: string;
  targetType: MediaLinkTargetType;
  targetId: string;
  notes: string | null;
  createdAt: Date;
}): MediaLinkRecord => ({
  id: row.id,
  mediaObjectId: row.mediaObjectId,
  targetType: row.targetType,
  targetId: row.targetId,
  notes: row.notes,
  createdAt: row.createdAt.toISOString()
});

const toTargetMediaLinkJson = (
  row: Parameters<typeof toMediaLinkJson>[0] & { mediaObject: Parameters<typeof toMediaObjectJson>[0] }
): TargetMediaLinkRecord => ({
  ...toMediaLinkJson(row),
  mediaObject: toMediaObjectJson(row.mediaObject)
});

const notFound = (message: string) => {
  const err = new Error(message);
  (err as Error & { statusCode: number }).statusCode = 404;
  return err;
};

export class EvidenceService {
  private async assertTargetExists(
    userId: string,
    targetType: MediaLinkTargetType,
    targetId: string
  ): Promise<void> {
    const where = { id: targetId, userId };
    const exists =
      targetType === "PERSON_PROFILE"
        ? await prisma.personProfile.findFirst({ where, select: { id: true } })
        : targetType === "LIFE_EVENT"
          ? await prisma.lifeEvent.findFirst({ where, select: { id: true } })
          : targetType === "SOURCE"
            ? await prisma.source.findFirst({ where, select: { id: true } })
            : await prisma.family.findFirst({ where, select: { id: true } });
    if (!exists) {
      throw notFound("Media link target not found");
    }
  }

  async listRepositories(userId: string): Promise<RepositoryRecord[]> {
    const rows = await prisma.repository.findMany({
      where: { userId },
      orderBy: { name: "asc" }
    });
    return rows.map(toRepositoryJson);
  }

  async createRepository(userId: string, body: CreateRepositoryBody): Promise<RepositoryRecord> {
    const created = await prisma.repository.create({
      data: {
        userId,
        name: body.name.trim(),
        addressLine1: body.addressLine1?.trim() ? body.addressLine1.trim() : null,
        url: body.url?.trim() ? body.url.trim() : null,
        notes: body.notes?.trim() ? body.notes.trim() : null
      }
    });
    return toRepositoryJson(created);
  }

  async updateRepository(userId: string, id: string, body: PatchRepositoryBody): Promise<RepositoryRecord> {
    const existing = await prisma.repository.findFirst({ where: { id, userId } });
    if (!existing) {
      const err = new Error("Repository not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    const updated = await prisma.repository.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.addressLine1 !== undefined
          ? { addressLine1: body.addressLine1?.trim() ? body.addressLine1.trim() : null }
          : {}),
        ...(body.url !== undefined ? { url: body.url?.trim() ? body.url.trim() : null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes?.trim() ? body.notes.trim() : null } : {})
      }
    });
    return toRepositoryJson(updated);
  }

  async deleteRepository(userId: string, id: string): Promise<void> {
    const deleted = await prisma.repository.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) {
      const err = new Error("Repository not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
  }

  async listSources(userId: string, q?: string): Promise<SourceRecord[]> {
    const rows = await prisma.source.findMany({
      where: {
        userId,
        ...(q?.trim()
          ? {
              title: { contains: q.trim(), mode: "insensitive" as const }
            }
          : {})
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      include: { repository: true },
      take: 200
    });
    return rows.map((r) => toSourceJson(r, r.repository));
  }

  async createSource(userId: string, body: CreateSourceBody): Promise<SourceRecord> {
    if (body.repositoryId) {
      const repo = await prisma.repository.findFirst({
        where: { id: body.repositoryId, userId }
      });
      if (!repo) {
        const err = new Error("Repository not found");
        (err as Error & { statusCode: number }).statusCode = 404;
        throw err;
      }
    }
    const created = await prisma.source.create({
      data: {
        userId,
        repositoryId: body.repositoryId?.trim() ? body.repositoryId.trim() : null,
        title: body.title.trim(),
        author: body.author?.trim() ? body.author.trim() : null,
        publication: body.publication?.trim() ? body.publication.trim() : null,
        url: body.url?.trim() ? body.url.trim() : null,
        notes: body.notes?.trim() ? body.notes.trim() : null
      },
      include: { repository: true }
    });
    return toSourceJson(created, created.repository);
  }

  async updateSource(userId: string, id: string, body: PatchSourceBody): Promise<SourceRecord> {
    const existing = await prisma.source.findFirst({ where: { id, userId } });
    if (!existing) {
      const err = new Error("Source not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    if (body.repositoryId !== undefined && body.repositoryId) {
      const repo = await prisma.repository.findFirst({
        where: { id: body.repositoryId, userId }
      });
      if (!repo) {
        const err = new Error("Repository not found");
        (err as Error & { statusCode: number }).statusCode = 404;
        throw err;
      }
    }
    const updated = await prisma.source.update({
      where: { id },
      data: {
        ...(body.repositoryId !== undefined
          ? { repositoryId: body.repositoryId?.trim() ? body.repositoryId.trim() : null }
          : {}),
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.author !== undefined ? { author: body.author?.trim() ? body.author.trim() : null } : {}),
        ...(body.publication !== undefined
          ? { publication: body.publication?.trim() ? body.publication.trim() : null }
          : {}),
        ...(body.url !== undefined ? { url: body.url?.trim() ? body.url.trim() : null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes?.trim() ? body.notes.trim() : null } : {})
      },
      include: { repository: true }
    });
    return toSourceJson(updated, updated.repository);
  }

  /**
   * Point all citations at `intoSourceId`, then delete `fromSourceId`. Both sources must belong to the user.
   */
  async mergeSources(userId: string, fromSourceId: string, intoSourceId: string): Promise<void> {
    if (fromSourceId === intoSourceId) {
      const err = new Error("Cannot merge a source into itself");
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }
    const from = await prisma.source.findFirst({ where: { id: fromSourceId, userId } });
    const into = await prisma.source.findFirst({ where: { id: intoSourceId, userId } });
    if (!from || !into) {
      const err = new Error("Source not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    await prisma.$transaction(async (tx) => {
      await tx.citation.updateMany({
        where: { userId, sourceId: fromSourceId },
        data: { sourceId: intoSourceId }
      });
      await tx.source.delete({ where: { id: fromSourceId } });
    });
  }

  async deleteSource(userId: string, id: string): Promise<void> {
    const existing = await prisma.source.findFirst({ where: { id, userId } });
    if (!existing) {
      const err = new Error("Source not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    try {
      await prisma.source.delete({ where: { id } });
    } catch (e: unknown) {
      const code = typeof e === "object" && e && "code" in e ? (e as { code: string }).code : "";
      if (code === "P2003") {
        const err = new Error("Source is still cited by one or more life events");
        (err as Error & { statusCode: number }).statusCode = 409;
        throw err;
      }
      throw e;
    }
  }

  async listMediaObjects(userId: string): Promise<MediaObjectRecord[]> {
    const rows = await prisma.mediaObject.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 500
    });
    return rows.map(toMediaObjectJson);
  }

  async getMediaObjectByStorageUrl(userId: string, storageUrl: string): Promise<MediaObjectRecord | null> {
    const row = await prisma.mediaObject.findFirst({
      where: { userId, storageUrl }
    });
    return row ? toMediaObjectJson(row) : null;
  }

  async createMediaObject(userId: string, body: CreateMediaObjectBody): Promise<MediaObjectRecord> {
    const created = await prisma.mediaObject.create({
      data: {
        userId,
        storageUrl: body.storageUrl.trim(),
        mimeType: body.mimeType?.trim() ? body.mimeType.trim() : null,
        checksum: body.checksum?.trim() ? body.checksum.trim() : null,
        immichAssetId: body.immichAssetId?.trim() ? body.immichAssetId.trim() : null,
        title: body.title?.trim() ? body.title.trim() : null
      }
    });
    return toMediaObjectJson(created);
  }

  async updateMediaObject(
    userId: string,
    id: string,
    body: PatchMediaObjectBody
  ): Promise<MediaObjectRecord> {
    const existing = await prisma.mediaObject.findFirst({ where: { id, userId } });
    if (!existing) {
      const err = new Error("Media object not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    const updated = await prisma.mediaObject.update({
      where: { id },
      data: {
        ...(body.storageUrl !== undefined ? { storageUrl: body.storageUrl.trim() } : {}),
        ...(body.mimeType !== undefined
          ? { mimeType: body.mimeType?.trim() ? body.mimeType.trim() : null }
          : {}),
        ...(body.checksum !== undefined
          ? { checksum: body.checksum?.trim() ? body.checksum.trim() : null }
          : {}),
        ...(body.immichAssetId !== undefined
          ? { immichAssetId: body.immichAssetId?.trim() ? body.immichAssetId.trim() : null }
          : {}),
        ...(body.title !== undefined ? { title: body.title?.trim() ? body.title.trim() : null } : {})
      }
    });
    return toMediaObjectJson(updated);
  }

  async deleteMediaObject(userId: string, id: string): Promise<void> {
    const deleted = await prisma.mediaObject.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) {
      const err = new Error("Media object not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
  }

  async listMediaLinksForObject(userId: string, mediaObjectId: string): Promise<MediaLinkRecord[]> {
    const parent = await prisma.mediaObject.findFirst({ where: { id: mediaObjectId, userId } });
    if (!parent) {
      const err = new Error("Media object not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
    const rows = await prisma.mediaLink.findMany({
      where: { userId, mediaObjectId },
      orderBy: { createdAt: "desc" }
    });
    return rows.map(toMediaLinkJson);
  }

  async listMediaLinksForTarget(
    userId: string,
    targetType: MediaLinkTargetType,
    targetId: string
  ): Promise<TargetMediaLinkRecord[]> {
    const trimmedTargetId = targetId.trim();
    await this.assertTargetExists(userId, targetType, trimmedTargetId);
    const rows = await prisma.mediaLink.findMany({
      where: { userId, targetType, targetId: trimmedTargetId },
      include: { mediaObject: true },
      orderBy: { createdAt: "desc" }
    });
    return rows.map(toTargetMediaLinkJson);
  }

  async createMediaLink(
    userId: string,
    mediaObjectId: string,
    body: CreateMediaLinkBody
  ): Promise<MediaLinkRecord> {
    const parent = await prisma.mediaObject.findFirst({ where: { id: mediaObjectId, userId } });
    if (!parent) {
      throw notFound("Media object not found");
    }
    const targetId = body.targetId.trim();
    await this.assertTargetExists(userId, body.targetType, targetId);
    const existing = await prisma.mediaLink.findFirst({
      where: {
        userId,
        mediaObjectId,
        targetType: body.targetType,
        targetId
      }
    });
    if (existing) {
      return toMediaLinkJson(existing);
    }
    const created = await prisma.mediaLink.create({
      data: {
        userId,
        mediaObjectId,
        targetType: body.targetType,
        targetId,
        notes: body.notes?.trim() ? body.notes.trim() : null
      }
    });
    return toMediaLinkJson(created);
  }

  async deleteMediaLink(userId: string, linkId: string): Promise<void> {
    const deleted = await prisma.mediaLink.deleteMany({ where: { id: linkId, userId } });
    if (deleted.count === 0) {
      const err = new Error("Media link not found");
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }
  }
}
