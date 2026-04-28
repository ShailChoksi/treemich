import type { Prisma } from "@prisma/client";
import type { PersonThumbnailRecord } from "@treemich/shared";
import { prisma } from "../../db/client.js";
import { storeMediaBuffer } from "../../evidence/mediaStorage.js";
import { personThumbnailToJson } from "../../people/service.js";
import type { ImmichClient } from "./client.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

const extensionForContentType = (contentType: string) => {
  if (contentType.includes("png")) {
    return ".png";
  }
  if (contentType.includes("webp")) {
    return ".webp";
  }
  return ".jpg";
};

export const importImmichThumbnailForIdentity = async (
  options: {
    userId: string;
    personId: string;
    identity: { id: string; providerPersonId: string };
    immichClient: Pick<ImmichClient, "getPersonThumbnail">;
  },
  db: DbClient = prisma
): Promise<PersonThumbnailRecord> => {
  const thumbnail = await options.immichClient.getPersonThumbnail(options.identity.providerPersonId);
  const stored = await storeMediaBuffer(thumbnail.data, {
    originalName: `${options.identity.providerPersonId}${extensionForContentType(thumbnail.contentType)}`
  });
  const now = new Date();
  const created = await db.personThumbnail.create({
    data: {
      userId: options.userId,
      personId: options.personId,
      source: "IMMICH",
      storageUrl: stored.storageUrl,
      mimeType: thumbnail.contentType,
      checksum: stored.checksum,
      sourceExternalIdentityId: options.identity.id,
      importedAt: now
    }
  });
  await db.personExternalIdentity.update({
    where: { id: options.identity.id },
    data: { thumbnailImportedAt: now, lastSeenAt: now }
  });
  return personThumbnailToJson(created);
};
