import type { PersonName, PersonNameType, Prisma } from "@prisma/client";
import type { CreatePersonNameBody, PatchPersonNameBody } from "@treemich/shared";
import { formatPersonNameDisplay } from "@treemich/shared";
import { prisma } from "../db/client.js";
import { HttpNotFoundError, HttpValidationError } from "../lifeEvents/errors.js";
import type { ProfileResolver } from "../people/profileResolver.js";

export const personNameToJson = (row: PersonName) => ({
  id: row.id,
  type: row.type,
  givenName: row.givenName,
  surname: row.surname,
  prefix: row.prefix,
  suffix: row.suffix,
  isPrimary: row.isPrimary,
  notes: row.notes,
  display: formatPersonNameDisplay({
    prefix: row.prefix,
    givenName: row.givenName,
    surname: row.surname,
    suffix: row.suffix
  }),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export const resolveDisplayNameForPerson = (opts: {
  immichName: string;
  displayNameOverride: string | null;
  givenName: string | null;
  surname: string | null;
  primaryName: PersonName | null;
}): string => {
  if (opts.primaryName) {
    const fromPrimary = formatPersonNameDisplay({
      prefix: opts.primaryName.prefix,
      givenName: opts.primaryName.givenName,
      surname: opts.primaryName.surname,
      suffix: opts.primaryName.suffix
    });
    if (fromPrimary) {
      return fromPrimary;
    }
  }
  if (opts.displayNameOverride?.trim()) {
    return opts.displayNameOverride.trim();
  }
  const g = [opts.givenName, opts.surname]
    .filter((p) => p != null && String(p).trim() !== "")
    .join(" ")
    .trim();
  if (g) {
    return g;
  }
  return opts.immichName;
};

export class PersonNameService {
  constructor(private readonly profileResolver: ProfileResolver) {}

  private async resolveProfileOrNull(userId: string, personId: string) {
    try {
      return await this.profileResolver.resolveProfile(userId, personId);
    } catch (error) {
      if (error instanceof HttpNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async listByPersonId(userId: string, personId: string) {
    const profile = await this.resolveProfileOrNull(userId, personId);
    if (!profile) {
      return [] as ReturnType<typeof personNameToJson>[];
    }
    const rows = await prisma.personName.findMany({
      where: { personProfileId: profile },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
    });
    return rows.map(personNameToJson);
  }

  async getPrimaryMapForProfileIds(
    userId: string,
    personProfileIds: string[]
  ): Promise<Map<string, PersonName>> {
    if (personProfileIds.length === 0) {
      return new Map();
    }
    const rows = await prisma.personName.findMany({
      where: {
        userId,
        personProfileId: { in: personProfileIds },
        isPrimary: true
      }
    });
    return new Map(rows.map((r) => [r.personProfileId, r]));
  }

  async getAllFormattedForUser(userId: string): Promise<Map<string, string[]>> {
    const rows = await prisma.personName.findMany({
      where: { userId },
      include: {
        personProfile: { select: { id: true } }
      }
    });
    const byPerson = new Map<string, string[]>();
    for (const r of rows) {
      const iid = r.personProfile.id;
      const text = formatPersonNameDisplay({
        prefix: r.prefix,
        givenName: r.givenName,
        surname: r.surname,
        suffix: r.suffix
      });
      if (!text) {
        continue;
      }
      const list = byPerson.get(iid) ?? [];
      list.push(text.toLowerCase());
      byPerson.set(iid, list);
    }
    return byPerson;
  }

  async create(userId: string, personId: string, body: CreatePersonNameBody) {
    const profile = await this.resolveProfileOrNull(userId, personId);
    if (!profile) {
      throw new HttpNotFoundError("Person profile not found");
    }
    if (body.isPrimary) {
      await prisma.personName.updateMany({
        where: { personProfileId: profile, userId },
        data: { isPrimary: false }
      });
    }
    const created = await prisma.personName.create({
      data: {
        userId,
        personProfileId: profile,
        type: body.type as PersonNameType,
        givenName: body.givenName ?? null,
        surname: body.surname ?? null,
        prefix: body.prefix ?? null,
        suffix: body.suffix ?? null,
        notes: body.notes ?? null,
        isPrimary: body.isPrimary ?? false
      }
    });
    return personNameToJson(created);
  }

  async update(userId: string, personId: string, nameId: string, body: PatchPersonNameBody) {
    const profile = await this.resolveProfileOrNull(userId, personId);
    if (!profile) {
      throw new HttpNotFoundError("Person profile not found");
    }
    const existing = await prisma.personName.findFirst({
      where: { id: nameId, personProfileId: profile, userId }
    });
    if (!existing) {
      throw new HttpNotFoundError("Name not found");
    }
    if (body.isPrimary === true) {
      const data = this.buildPatchInput(body, true);
      await prisma.$transaction([
        prisma.personName.updateMany({
          where: { personProfileId: profile, userId },
          data: { isPrimary: false }
        }),
        prisma.personName.update({
          where: { id: nameId },
          data: { isPrimary: true, ...data }
        })
      ]);
    } else {
      if (body.isPrimary === false && existing.isPrimary) {
        throw new HttpValidationError("Set another name as primary before clearing primary on this record");
      }
      await prisma.personName.update({
        where: { id: nameId },
        data: this.buildPatchInput(body, false)
      });
    }
    const updated = await prisma.personName.findFirstOrThrow({ where: { id: nameId } });
    return personNameToJson(updated);
  }

  private buildPatchInput(
    body: PatchPersonNameBody,
    forPrimaryPromotion: boolean
  ): Prisma.PersonNameUpdateInput {
    const data: Prisma.PersonNameUpdateInput = {};
    if (body.type != null) {
      data.type = body.type as PersonNameType;
    }
    if (body.givenName !== undefined) {
      data.givenName = body.givenName;
    }
    if (body.surname !== undefined) {
      data.surname = body.surname;
    }
    if (body.prefix !== undefined) {
      data.prefix = body.prefix;
    }
    if (body.suffix !== undefined) {
      data.suffix = body.suffix;
    }
    if (body.notes !== undefined) {
      data.notes = body.notes;
    }
    if (!forPrimaryPromotion && body.isPrimary === true) {
      data.isPrimary = true;
    }
    return data;
  }

  async delete(userId: string, personId: string, nameId: string) {
    const profile = await this.resolveProfileOrNull(userId, personId);
    if (!profile) {
      throw new HttpNotFoundError("Person profile not found");
    }
    const existing = await prisma.personName.findFirst({
      where: { id: nameId, personProfileId: profile, userId }
    });
    if (!existing) {
      throw new HttpNotFoundError("Name not found");
    }
    if (existing.isPrimary) {
      const count = await prisma.personName.count({ where: { personProfileId: profile, userId } });
      if (count <= 1) {
        throw new HttpValidationError("Cannot delete the only name record for a person");
      }
      throw new HttpValidationError("Set another name as primary before deleting the primary name");
    }
    await prisma.personName.delete({ where: { id: nameId } });
  }

  async setPrimary(userId: string, personId: string, nameId: string) {
    const profile = await this.resolveProfileOrNull(userId, personId);
    if (!profile) {
      throw new HttpNotFoundError("Person profile not found");
    }
    const existing = await prisma.personName.findFirst({
      where: { id: nameId, personProfileId: profile, userId }
    });
    if (!existing) {
      throw new HttpNotFoundError("Name not found");
    }
    await prisma.$transaction([
      prisma.personName.updateMany({
        where: { personProfileId: profile, userId },
        data: { isPrimary: false }
      }),
      prisma.personName.update({ where: { id: nameId }, data: { isPrimary: true } })
    ]);
    const updated = await prisma.personName.findFirstOrThrow({ where: { id: nameId } });
    return personNameToJson(updated);
  }
}
