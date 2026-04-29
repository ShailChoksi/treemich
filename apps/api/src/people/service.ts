import type {
  Gender,
  PersonExternalIdentity,
  PersonExternalIdentityProvider,
  PersonProfile,
  PersonThumbnail,
  Prisma
} from "@prisma/client";
import type {
  CreatePersonBody,
  CreatePersonExternalIdentityBody,
  ImmichProviderPerson,
  PatchPersonBody,
  PersonExternalIdentityRecord,
  PersonRecord,
  PersonThumbnailRecord
} from "@treemich/shared";
import { prisma } from "../db/client.js";
import { HttpConflictError, HttpNotFoundError } from "../lifeEvents/errors.js";
import { resolveDisplayNameForPerson } from "../personNames/service.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

type PersonWithIncludes = PersonProfile & {
  externalIdentities: PersonExternalIdentity[];
  thumbnails: PersonThumbnail[];
};

export type ImmichExternalIdentityNameSyncResult = {
  matched: number;
  updated: number;
  skippedUnnamed: number;
};

const toIsoOrNull = (value?: Date | null) => value?.toISOString() ?? null;

const normalizeOptionalString = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() ? value.trim() : null;

export const personExternalIdentityToJson = (row: PersonExternalIdentity): PersonExternalIdentityRecord => ({
  id: row.id,
  personId: row.personId,
  provider: row.provider,
  providerPersonId: row.providerPersonId,
  providerBaseUrl: row.providerBaseUrl,
  displayName: row.displayName,
  thumbnailImportedAt: toIsoOrNull(row.thumbnailImportedAt),
  lastSeenAt: toIsoOrNull(row.lastSeenAt),
  metadata:
    row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {},
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export const personThumbnailToJson = (row: PersonThumbnail): PersonThumbnailRecord => ({
  id: row.id,
  personId: row.personId,
  source: row.source,
  storageUrl: row.storageUrl,
  mimeType: row.mimeType,
  checksum: row.checksum,
  sourceExternalIdentityId: row.sourceExternalIdentityId,
  importedAt: toIsoOrNull(row.importedAt),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

const fallbackName = (person: Pick<PersonProfile, "id" | "givenName" | "surname" | "displayNameOverride">) =>
  person.displayNameOverride?.trim() ||
  [person.givenName, person.surname].filter(Boolean).join(" ").trim() ||
  `Person ${person.id.slice(0, 8)}`;

export const personToJson = (
  person: PersonWithIncludes,
  options?: { birthDate?: string | null }
): PersonRecord => {
  const externalIdentities = person.externalIdentities.map(personExternalIdentityToJson);
  const thumbnail = person.thumbnails[0] ? personThumbnailToJson(person.thumbnails[0]) : null;
  const legacyImmich = externalIdentities.find((identity) => identity.provider === "IMMICH") ?? null;
  const displayName = resolveDisplayNameForPerson({
    immichName: legacyImmich?.displayName ?? fallbackName(person),
    displayNameOverride: person.displayNameOverride,
    givenName: person.givenName,
    surname: person.surname,
    primaryName: null
  });

  return {
    id: person.id,
    name: displayName,
    displayName: displayName === fallbackName(person) ? null : displayName,
    birthDate: options?.birthDate ?? null,
    thumbnailPath: thumbnail?.storageUrl ?? null,
    profile: {
      id: person.id,
      gender: person.gender,
      givenName: person.givenName,
      surname: person.surname,
      nicknames: person.nicknames,
      externalIds:
        person.externalIds != null &&
        typeof person.externalIds === "object" &&
        !Array.isArray(person.externalIds)
          ? (person.externalIds as Record<string, string>)
          : {}
    },
    externalIdentities,
    thumbnail,
    hasRelationship: false
  };
};

export class PersonService {
  async resolvePersonId(userId: string, personId: string, db: DbClient = prisma): Promise<string> {
    const direct = await db.personProfile.findFirst({
      where: { id: personId, userId },
      select: { id: true }
    });
    if (direct) {
      return direct.id;
    }

    throw new HttpNotFoundError("Person not found");
  }

  async resolveMany(userId: string, ids: string[], db: DbClient = prisma): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of [...new Set(ids.filter(Boolean))]) {
      out.set(id, await this.resolvePersonId(userId, id, db));
    }
    return out;
  }

  async list(userId: string, query?: string): Promise<PersonRecord[]> {
    const q = query?.trim();
    const rows = await prisma.personProfile.findMany({
      where: {
        userId,
        ...(q
          ? {
              OR: [
                { displayNameOverride: { contains: q, mode: "insensitive" } },
                { givenName: { contains: q, mode: "insensitive" } },
                { surname: { contains: q, mode: "insensitive" } },
                { nicknames: { contains: q, mode: "insensitive" } },
                { personNames: { some: { givenName: { contains: q, mode: "insensitive" } } } },
                { personNames: { some: { surname: { contains: q, mode: "insensitive" } } } },
                { externalIdentities: { some: { displayName: { contains: q, mode: "insensitive" } } } }
              ]
            }
          : {})
      },
      include: {
        externalIdentities: true,
        thumbnails: { orderBy: { updatedAt: "desc" }, take: 1 }
      },
      orderBy: [{ surname: "asc" }, { givenName: "asc" }, { createdAt: "asc" }]
    });

    return rows.map((row) => personToJson(row));
  }

  async get(userId: string, personId: string): Promise<PersonWithIncludes> {
    const id = await this.resolvePersonId(userId, personId);
    const row = await prisma.personProfile.findFirst({
      where: { id, userId },
      include: {
        externalIdentities: true,
        thumbnails: { orderBy: { updatedAt: "desc" }, take: 1 }
      }
    });
    if (!row) {
      throw new HttpNotFoundError("Person not found");
    }
    return row;
  }

  async create(userId: string, body: CreatePersonBody): Promise<PersonRecord> {
    const created = await prisma.personProfile.create({
      data: {
        userId,
        gender: (body.gender ?? "UNKNOWN") as Gender,
        displayNameOverride: normalizeOptionalString(body.displayNameOverride),
        givenName: normalizeOptionalString(body.givenName),
        surname: normalizeOptionalString(body.surname),
        nicknames: normalizeOptionalString(body.nicknames)
      },
      include: { externalIdentities: true, thumbnails: true }
    });
    return personToJson(created);
  }

  async update(userId: string, personId: string, body: PatchPersonBody): Promise<PersonRecord> {
    const id = await this.resolvePersonId(userId, personId);
    const updated = await prisma.personProfile.update({
      where: { id },
      data: {
        ...(body.gender !== undefined ? { gender: body.gender as Gender } : {}),
        ...(body.displayNameOverride !== undefined
          ? { displayNameOverride: normalizeOptionalString(body.displayNameOverride) }
          : {}),
        ...(body.givenName !== undefined ? { givenName: normalizeOptionalString(body.givenName) } : {}),
        ...(body.surname !== undefined ? { surname: normalizeOptionalString(body.surname) } : {}),
        ...(body.nicknames !== undefined ? { nicknames: normalizeOptionalString(body.nicknames) } : {})
      },
      include: {
        externalIdentities: true,
        thumbnails: { orderBy: { updatedAt: "desc" }, take: 1 }
      }
    });
    return personToJson(updated);
  }

  async delete(userId: string, personId: string): Promise<void> {
    const person = await prisma.personProfile.findFirst({
      where: { id: personId, userId },
      select: { id: true }
    });
    if (!person) {
      throw new HttpNotFoundError("Person not found");
    }

    const deleted = await prisma.personProfile.deleteMany({
      where: { id: person.id, userId }
    });
    if (deleted.count === 0) {
      throw new HttpNotFoundError("Person not found");
    }
  }

  async syncImmichExternalIdentityNames(
    userId: string,
    people: Pick<ImmichProviderPerson, "id" | "name">[],
    db: DbClient = prisma
  ): Promise<ImmichExternalIdentityNameSyncResult> {
    const namesByImmichId = new Map(
      people
        .map((person) => [person.id, String(person.name ?? "").trim()] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[0]))
    );
    if (namesByImmichId.size === 0) {
      return { matched: 0, updated: 0, skippedUnnamed: 0 };
    }

    const identities = await db.personExternalIdentity.findMany({
      where: {
        userId,
        provider: "IMMICH",
        providerPersonId: { in: [...namesByImmichId.keys()] }
      },
      select: {
        id: true,
        providerPersonId: true,
        displayName: true
      }
    });

    const now = new Date();
    let updated = 0;
    let skippedUnnamed = 0;
    for (const identity of identities) {
      const immichName = namesByImmichId.get(identity.providerPersonId)?.trim();
      if (!immichName) {
        skippedUnnamed += 1;
        continue;
      }
      if (identity.displayName?.trim() === immichName) {
        continue;
      }
      await db.personExternalIdentity.update({
        where: { id: identity.id },
        data: {
          displayName: immichName,
          lastSeenAt: now
        }
      });
      updated += 1;
    }

    return {
      matched: identities.length,
      updated,
      skippedUnnamed
    };
  }

  async addExternalIdentity(
    userId: string,
    personId: string,
    body: CreatePersonExternalIdentityBody
  ): Promise<PersonExternalIdentityRecord> {
    const id = await this.resolvePersonId(userId, personId);
    try {
      const created = await prisma.personExternalIdentity.create({
        data: {
          userId,
          personId: id,
          provider: body.provider as PersonExternalIdentityProvider,
          providerPersonId: body.providerPersonId,
          providerBaseUrl: normalizeOptionalString(body.providerBaseUrl),
          displayName: normalizeOptionalString(body.displayName),
          lastSeenAt: new Date(),
          metadata: (body.metadata ?? {}) as Prisma.InputJsonValue
        }
      });
      return personExternalIdentityToJson(created);
    } catch (error) {
      const prismaError = error as { code?: unknown } | null;
      if (prismaError?.code === "P2002") {
        throw new HttpConflictError("External identity already exists");
      }
      throw error;
    }
  }

  async listExternalIdentities(userId: string, personId: string): Promise<PersonExternalIdentityRecord[]> {
    const id = await this.resolvePersonId(userId, personId);
    const rows = await prisma.personExternalIdentity.findMany({
      where: { userId, personId: id },
      orderBy: [{ provider: "asc" }, { createdAt: "asc" }]
    });
    return rows.map(personExternalIdentityToJson);
  }

  async deleteExternalIdentity(userId: string, personId: string, identityId: string): Promise<void> {
    const id = await this.resolvePersonId(userId, personId);
    const deleted = await prisma.personExternalIdentity.deleteMany({
      where: { id: identityId, personId: id, userId }
    });
    if (deleted.count === 0) {
      throw new HttpNotFoundError("External identity not found");
    }
  }

  async addUploadedThumbnail(
    userId: string,
    personId: string,
    thumbnail: { storageUrl: string; mimeType: string | null; checksum: string | null }
  ): Promise<PersonThumbnailRecord> {
    const id = await this.resolvePersonId(userId, personId);
    const created = await prisma.personThumbnail.create({
      data: {
        userId,
        personId: id,
        source: "UPLOADED",
        storageUrl: thumbnail.storageUrl,
        mimeType: thumbnail.mimeType,
        checksum: thumbnail.checksum,
        importedAt: new Date()
      }
    });
    return personThumbnailToJson(created);
  }
}
