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
  ImmichPeopleSyncSummary,
  ImmichProviderPerson,
  PatchPersonBody,
  PersonExternalIdentityRecord,
  PersonRecord,
  PersonThumbnailRecord
} from "@treemich/shared";
import { splitImmichPersonDisplayName } from "@treemich/shared";
import { prisma } from "../db/client.js";
import { HttpConflictError, HttpNotFoundError } from "../lifeEvents/errors.js";
import { resolveDisplayNameForPerson } from "../personNames/service.js";
import { comparePersonSearchSortKeys, personRecordSearchSortKey } from "./personSearchRank.js";
import type { ProfileResolver } from "./profileResolver.js";

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

const pickMatchingImmichIdentityForSync = (
  rows: PersonExternalIdentity[],
  normalizedCurrentBaseUrl: string | null
): PersonExternalIdentity | null => {
  if (rows.length === 0) {
    return null;
  }
  const candidates = rows.filter((row) =>
    normalizedCurrentBaseUrl == null
      ? row.providerBaseUrl == null
      : row.providerBaseUrl === normalizedCurrentBaseUrl || row.providerBaseUrl == null
  );
  if (candidates.length === 0) {
    return null;
  }
  const exact = candidates.find((row) => row.providerBaseUrl === normalizedCurrentBaseUrl);
  return exact ?? candidates[0] ?? null;
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

const buildPersonListSearchWhere = (userId: string, q: string): Prisma.PersonProfileWhereInput => ({
  userId,
  OR: [
    { displayNameOverride: { contains: q, mode: "insensitive" } },
    { givenName: { contains: q, mode: "insensitive" } },
    { surname: { contains: q, mode: "insensitive" } },
    { nicknames: { contains: q, mode: "insensitive" } },
    { personNames: { some: { givenName: { contains: q, mode: "insensitive" } } } },
    { personNames: { some: { surname: { contains: q, mode: "insensitive" } } } },
    { externalIdentities: { some: { displayName: { contains: q, mode: "insensitive" } } } }
  ]
});

export class PersonService implements ProfileResolver {
  async resolveProfile(userId: string, personId: string, db: DbClient = prisma): Promise<string> {
    return this.resolvePersonId(userId, personId, db);
  }

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
      where: q ? buildPersonListSearchWhere(userId, q) : { userId },
      include: {
        externalIdentities: true,
        thumbnails: { orderBy: { updatedAt: "desc" }, take: 1 }
      },
      orderBy: [{ surname: "asc" }, { givenName: "asc" }, { createdAt: "asc" }]
    });

    return rows.map((row) => personToJson(row));
  }

  /**
   * Paginated people search for Profile UI. Results are ranked in-memory for deterministic ordering.
   */
  async listSearchPaged(
    userId: string,
    query: string,
    limit: number,
    offset: number
  ): Promise<{ people: PersonRecord[]; nextOffset: number | null }> {
    const q = query.trim();
    const rows = await prisma.personProfile.findMany({
      where: buildPersonListSearchWhere(userId, q),
      include: {
        externalIdentities: true,
        thumbnails: { orderBy: { updatedAt: "desc" }, take: 1 }
      }
    });
    const records = rows.map((row) => personToJson(row));
    const sorted = [...records].sort((left, right) =>
      comparePersonSearchSortKeys(personRecordSearchSortKey(left, q), personRecordSearchSortKey(right, q))
    );
    const page = sorted.slice(offset, offset + limit);
    const nextOffset = offset + page.length < sorted.length ? offset + limit : null;
    return { people: page, nextOffset };
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

  /**
   * Creates Treemich people + Immich external identities for named Immich people not yet linked for this
   * provider base URL (or legacy null base URL). Updates existing linked identities' display names only.
   */
  async syncImmichLabelledPeople(
    userId: string,
    people: ImmichProviderPerson[],
    options: { providerBaseUrl: string | null }
  ): Promise<ImmichPeopleSyncSummary> {
    const normalizedCurrent =
      options.providerBaseUrl != null && options.providerBaseUrl.trim() !== ""
        ? options.providerBaseUrl.trim()
        : null;

    const skippedUnnamed = people.filter((person) => !String(person.name ?? "").trim()).length;
    const namedPeople = people.filter((person) => String(person.name ?? "").trim().length > 0);
    const uniqueNamedById = new Map(namedPeople.map((person) => [person.id, person]));
    const uniqueNamed = [...uniqueNamedById.values()];
    if (uniqueNamed.length === 0) {
      return { created: 0, updated: 0, alreadyLinked: 0, skippedUnnamed };
    }

    const providerPersonIds = [...uniqueNamedById.keys()];

    const identityWhere: Prisma.PersonExternalIdentityWhereInput =
      normalizedCurrent == null
        ? {
            userId,
            provider: "IMMICH",
            providerPersonId: { in: providerPersonIds },
            providerBaseUrl: null
          }
        : {
            userId,
            provider: "IMMICH",
            providerPersonId: { in: providerPersonIds },
            OR: [{ providerBaseUrl: normalizedCurrent }, { providerBaseUrl: null }]
          };

    const existingRows = await prisma.personExternalIdentity.findMany({ where: identityWhere });
    const byProviderPersonId = new Map<string, PersonExternalIdentity[]>();
    for (const row of existingRows) {
      const list = byProviderPersonId.get(row.providerPersonId) ?? [];
      list.push(row);
      byProviderPersonId.set(row.providerPersonId, list);
    }

    let created = 0;
    let updated = 0;
    let alreadyLinked = 0;
    const now = new Date();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const immich of uniqueNamed) {
        const trimmedName = String(immich.name).trim();
        const rowsForId = byProviderPersonId.get(immich.id) ?? [];
        const existing = pickMatchingImmichIdentityForSync(rowsForId, normalizedCurrent);

        if (existing) {
          const needsBaseMigration =
            existing.providerBaseUrl == null && normalizedCurrent != null && normalizedCurrent.length > 0;
          const needsNameUpdate = existing.displayName?.trim() !== trimmedName;
          if (!needsNameUpdate && !needsBaseMigration) {
            alreadyLinked += 1;
            continue;
          }
          await tx.personExternalIdentity.update({
            where: { id: existing.id },
            data: {
              displayName: trimmedName,
              lastSeenAt: now,
              ...(needsBaseMigration ? { providerBaseUrl: normalizedCurrent } : {})
            }
          });
          existing.displayName = trimmedName;
          if (needsBaseMigration) {
            existing.providerBaseUrl = normalizedCurrent;
          }
          updated += 1;
          continue;
        }

        const { givenName, surname } = splitImmichPersonDisplayName(trimmedName);
        const profile = await tx.personProfile.create({
          data: {
            userId,
            gender: "UNKNOWN" as Gender,
            givenName,
            surname
          }
        });
        await tx.personExternalIdentity.create({
          data: {
            userId,
            personId: profile.id,
            provider: "IMMICH",
            providerPersonId: immich.id,
            providerBaseUrl: normalizedCurrent,
            displayName: trimmedName,
            lastSeenAt: now,
            metadata: { importedFromImmichAutoSync: true } as Prisma.InputJsonValue
          }
        });
        created += 1;
      }
    });

    return { created, updated, alreadyLinked, skippedUnnamed };
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
