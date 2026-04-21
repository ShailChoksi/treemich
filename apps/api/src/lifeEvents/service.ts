import {
  type DateQualifier,
  type LifeEventType,
  type Prisma,
  type Place,
  type LifeEvent,
  type LifeEventCitation
} from "@prisma/client";
import type { CreateLifeEventBody, PatchLifeEventBody, PlaceInput } from "@treemich/shared";
import { prisma } from "../db/client.js";
import { HttpConflictError, HttpNotFoundError, HttpValidationError } from "./errors.js";
import {
  parseIsoDateToParts,
  partialDateToIsoString,
  validatePartialDateTriplet,
  type PartialDateParts
} from "./dateValue.js";

const isoFromLifeEventRow = (event: Pick<LifeEvent, "year" | "month" | "day">) =>
  partialDateToIsoString({
    year: event.year,
    month: event.month,
    day: event.day
  });

const relationshipScopedTypes: LifeEventType[] = ["MARRIAGE", "DIVORCE"];

const includeDefault = {
  place: true,
  citations: true
} satisfies Prisma.LifeEventInclude;

export type LifeEventWithRelations = LifeEvent & {
  place: Place | null;
  citations: LifeEventCitation[];
};

export class LifeEventService {
  async createPlace(userId: string, input: PlaceInput): Promise<Place> {
    return prisma.place.create({
      data: {
        userId,
        name: input.name,
        addressLine1: input.addressLine1 ?? null,
        locality: input.locality ?? null,
        adminArea: input.adminArea ?? null,
        postalCode: input.postalCode ?? null,
        countryCode: input.countryCode ?? null,
        latitude: input.latitude != null ? input.latitude : null,
        longitude: input.longitude != null ? input.longitude : null,
        notes: input.notes ?? null
      }
    });
  }

  async resolvePlaceId(
    userId: string,
    placeId: string | null | undefined,
    place: PlaceInput | null | undefined
  ): Promise<string | null> {
    if (placeId) {
      const row = await prisma.place.findFirst({
        where: { id: placeId, userId }
      });
      if (!row) {
        throw new HttpNotFoundError("Place not found");
      }
      return placeId;
    }
    if (place) {
      const created = await this.createPlace(userId, place);
      return created.id;
    }
    return null;
  }

  private assertPersonEventAllowed(eventType: LifeEventType) {
    if (relationshipScopedTypes.includes(eventType)) {
      throw new HttpConflictError("MARRIAGE and DIVORCE events must be attached to a relationship");
    }
  }

  private assertRelationshipEventAllowed(eventType: LifeEventType) {
    if (eventType === "BIRTH" || eventType === "DEATH") {
      throw new HttpConflictError("BIRTH and DEATH events must be attached to a person, not a relationship");
    }
  }

  private async assertNoDuplicatePersonEvent(
    userId: string,
    personProfileId: string,
    eventType: LifeEventType,
    excludeEventId?: string
  ) {
    if (eventType !== "BIRTH" && eventType !== "DEATH") {
      return;
    }
    const existing = await prisma.lifeEvent.findFirst({
      where: {
        userId,
        personProfileId,
        eventType,
        ...(excludeEventId ? { NOT: { id: excludeEventId } } : {})
      }
    });
    if (existing) {
      throw new HttpConflictError(`A ${eventType} event already exists for this person`);
    }
  }

  private buildDateData(body: CreateLifeEventBody | PatchLifeEventBody): {
    dateQualifier: DateQualifier;
    year: number | null;
    month: number | null;
    day: number | null;
    endYear: number | null;
    endMonth: number | null;
    endDay: number | null;
  } {
    const dq = (body.dateQualifier ?? "EXACT") as DateQualifier;
    const y = body.year ?? null;
    const m = body.month ?? null;
    const d = body.day ?? null;
    const err = validatePartialDateTriplet(y, m, d);
    if (err) {
      throw new HttpValidationError(err);
    }
    const ey = body.endYear ?? null;
    const em = body.endMonth ?? null;
    const ed = body.endDay ?? null;
    const errEnd = validatePartialDateTriplet(ey, em, ed);
    if (errEnd) {
      throw new HttpValidationError(`End date: ${errEnd}`);
    }
    return {
      dateQualifier: dq,
      year: y,
      month: m,
      day: d,
      endYear: ey,
      endMonth: em,
      endDay: ed
    };
  }

  async listPersonLifeEvents(
    userId: string,
    immichPersonId: string,
    options?: { includeCitations?: boolean }
  ): Promise<LifeEventWithRelations[]> {
    const profile = await prisma.personProfile.findUnique({
      where: { userId_immichPersonId: { userId, immichPersonId } }
    });
    if (!profile) {
      return [];
    }
    return prisma.lifeEvent.findMany({
      where: { userId, personProfileId: profile.id },
      orderBy: [{ year: "asc" }, { month: "asc" }, { day: "asc" }, { id: "asc" }],
      include: {
        place: true,
        ...(options?.includeCitations === false ? {} : { citations: true })
      }
    }) as Promise<LifeEventWithRelations[]>;
  }

  async createPersonLifeEvent(
    userId: string,
    immichPersonId: string,
    body: CreateLifeEventBody
  ): Promise<LifeEventWithRelations> {
    this.assertPersonEventAllowed(body.eventType);
    const profile = await prisma.personProfile.findUnique({
      where: { userId_immichPersonId: { userId, immichPersonId } }
    });
    if (!profile) {
      throw new HttpNotFoundError("Person profile not found");
    }
    await this.assertNoDuplicatePersonEvent(userId, profile.id, body.eventType);

    const placeId = await this.resolvePlaceId(userId, body.placeId ?? null, body.place ?? null);
    const dateData = this.buildDateData(body);

    const created = await prisma.lifeEvent.create({
      data: {
        userId,
        eventType: body.eventType,
        ...dateData,
        personProfileId: profile.id,
        relationshipId: null,
        placeId,
        notes: body.notes ?? null,
        citations: body.citations?.length
          ? {
              create: body.citations.map((c) => ({
                title: c.title ?? null,
                repository: c.repository ?? null,
                url: c.url ?? null,
                page: c.page ?? null,
                notes: c.notes ?? null,
                citedAt: c.citedAt ?? null
              }))
            }
          : undefined
      },
      include: includeDefault
    });
    return created as LifeEventWithRelations;
  }

  async updatePersonLifeEvent(
    userId: string,
    immichPersonId: string,
    eventId: string,
    body: PatchLifeEventBody
  ): Promise<LifeEventWithRelations> {
    const profile = await prisma.personProfile.findUnique({
      where: { userId_immichPersonId: { userId, immichPersonId } }
    });
    if (!profile) {
      throw new HttpNotFoundError("Person profile not found");
    }
    const existing = await prisma.lifeEvent.findFirst({
      where: { id: eventId, userId, personProfileId: profile.id }
    });
    if (!existing) {
      throw new HttpNotFoundError("Life event not found");
    }
    const nextType = body.eventType ?? existing.eventType;
    this.assertPersonEventAllowed(nextType);
    if (body.eventType && (body.eventType === "BIRTH" || body.eventType === "DEATH")) {
      await this.assertNoDuplicatePersonEvent(userId, profile.id, body.eventType, eventId);
    }

    let placeId: string | null | undefined;
    if (body.placeId !== undefined || body.place !== undefined) {
      placeId = await this.resolvePlaceId(userId, body.placeId ?? null, body.place ?? null);
    }
    const dateData =
      body.year !== undefined ||
      body.month !== undefined ||
      body.day !== undefined ||
      body.dateQualifier !== undefined ||
      body.endYear !== undefined
        ? this.buildDateData({
            eventType: nextType,
            dateQualifier: body.dateQualifier ?? existing.dateQualifier,
            year: body.year !== undefined ? body.year : existing.year,
            month: body.month !== undefined ? body.month : existing.month,
            day: body.day !== undefined ? body.day : existing.day,
            endYear: body.endYear !== undefined ? body.endYear : existing.endYear,
            endMonth: body.endMonth !== undefined ? body.endMonth : existing.endMonth,
            endDay: body.endDay !== undefined ? body.endDay : existing.endDay,
            placeId: body.placeId,
            place: body.place,
            notes: body.notes,
            citations: body.citations
          } as CreateLifeEventBody)
        : null;

    const updated = await prisma.lifeEvent.update({
      where: { id: eventId },
      data: {
        ...(body.eventType ? { eventType: body.eventType } : {}),
        ...(dateData ? dateData : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(placeId !== undefined ? { placeId } : {}),
        ...(body.citations
          ? {
              citations: {
                deleteMany: {},
                create: body.citations.map((c) => ({
                  title: c.title ?? null,
                  repository: c.repository ?? null,
                  url: c.url ?? null,
                  page: c.page ?? null,
                  notes: c.notes ?? null,
                  citedAt: c.citedAt ?? null
                }))
              }
            }
          : {})
      },
      include: includeDefault
    });
    return updated as LifeEventWithRelations;
  }

  async deletePersonLifeEvent(userId: string, immichPersonId: string, eventId: string): Promise<void> {
    const profile = await prisma.personProfile.findUnique({
      where: { userId_immichPersonId: { userId, immichPersonId } }
    });
    if (!profile) {
      throw new HttpNotFoundError("Person profile not found");
    }
    const deleted = await prisma.lifeEvent.deleteMany({
      where: { id: eventId, userId, personProfileId: profile.id }
    });
    if (deleted.count === 0) {
      throw new HttpNotFoundError("Life event not found");
    }
  }

  async listRelationshipLifeEvents(
    userId: string,
    relationshipId: string,
    options?: { includeCitations?: boolean }
  ): Promise<LifeEventWithRelations[]> {
    const rel = await prisma.relationship.findFirst({
      where: { id: relationshipId, userId }
    });
    if (!rel) {
      throw new HttpNotFoundError("Relationship not found");
    }
    return prisma.lifeEvent.findMany({
      where: { userId, relationshipId },
      orderBy: [{ year: "asc" }, { id: "asc" }],
      include: {
        place: true,
        ...(options?.includeCitations === false ? {} : { citations: true })
      }
    }) as Promise<LifeEventWithRelations[]>;
  }

  async createRelationshipLifeEvent(
    userId: string,
    relationshipId: string,
    body: CreateLifeEventBody
  ): Promise<LifeEventWithRelations> {
    this.assertRelationshipEventAllowed(body.eventType);
    const rel = await prisma.relationship.findFirst({
      where: { id: relationshipId, userId }
    });
    if (!rel) {
      throw new HttpNotFoundError("Relationship not found");
    }
    const placeId = await this.resolvePlaceId(userId, body.placeId ?? null, body.place ?? null);
    const dateData = this.buildDateData(body);
    const created = await prisma.lifeEvent.create({
      data: {
        userId,
        eventType: body.eventType,
        ...dateData,
        personProfileId: null,
        relationshipId,
        placeId,
        notes: body.notes ?? null,
        citations: body.citations?.length
          ? {
              create: body.citations.map((c) => ({
                title: c.title ?? null,
                repository: c.repository ?? null,
                url: c.url ?? null,
                page: c.page ?? null,
                notes: c.notes ?? null,
                citedAt: c.citedAt ?? null
              }))
            }
          : undefined
      },
      include: includeDefault
    });
    return created as LifeEventWithRelations;
  }

  async updateRelationshipLifeEvent(
    userId: string,
    relationshipId: string,
    eventId: string,
    body: PatchLifeEventBody
  ): Promise<LifeEventWithRelations> {
    const rel = await prisma.relationship.findFirst({
      where: { id: relationshipId, userId }
    });
    if (!rel) {
      throw new HttpNotFoundError("Relationship not found");
    }
    const existing = await prisma.lifeEvent.findFirst({
      where: { id: eventId, userId, relationshipId }
    });
    if (!existing) {
      throw new HttpNotFoundError("Life event not found");
    }
    const nextType = body.eventType ?? existing.eventType;
    if (body.eventType) {
      this.assertRelationshipEventAllowed(body.eventType);
    }
    let placeId: string | null | undefined;
    if (body.placeId !== undefined || body.place !== undefined) {
      placeId = await this.resolvePlaceId(userId, body.placeId ?? null, body.place ?? null);
    }
    const dateData =
      body.year !== undefined ||
      body.month !== undefined ||
      body.day !== undefined ||
      body.dateQualifier !== undefined ||
      body.endYear !== undefined
        ? this.buildDateData({
            eventType: nextType,
            dateQualifier: body.dateQualifier ?? existing.dateQualifier,
            year: body.year !== undefined ? body.year : existing.year,
            month: body.month !== undefined ? body.month : existing.month,
            day: body.day !== undefined ? body.day : existing.day,
            endYear: body.endYear !== undefined ? body.endYear : existing.endYear,
            endMonth: body.endMonth !== undefined ? body.endMonth : existing.endMonth,
            endDay: body.endDay !== undefined ? body.endDay : existing.endDay,
            placeId: body.placeId,
            place: body.place,
            notes: body.notes,
            citations: body.citations
          } as CreateLifeEventBody)
        : null;

    const updated = await prisma.lifeEvent.update({
      where: { id: eventId },
      data: {
        ...(body.eventType ? { eventType: body.eventType } : {}),
        ...(dateData ? dateData : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(placeId !== undefined ? { placeId } : {}),
        ...(body.citations
          ? {
              citations: {
                deleteMany: {},
                create: body.citations.map((c) => ({
                  title: c.title ?? null,
                  repository: c.repository ?? null,
                  url: c.url ?? null,
                  page: c.page ?? null,
                  notes: c.notes ?? null,
                  citedAt: c.citedAt ?? null
                }))
              }
            }
          : {})
      },
      include: includeDefault
    });
    return updated as LifeEventWithRelations;
  }

  async deleteRelationshipLifeEvent(userId: string, relationshipId: string, eventId: string): Promise<void> {
    const rel = await prisma.relationship.findFirst({
      where: { id: relationshipId, userId }
    });
    if (!rel) {
      throw new HttpNotFoundError("Relationship not found");
    }
    const deleted = await prisma.lifeEvent.deleteMany({
      where: { id: eventId, userId, relationshipId }
    });
    if (deleted.count === 0) {
      throw new HttpNotFoundError("Life event not found");
    }
  }

  /**
   * Batch-load BIRTH/DEATH for bridge (GET /people, search) — single query.
   */
  async getBirthDeathByPersonProfileIds(
    userId: string,
    personProfileIds: string[]
  ): Promise<Map<string, { birth: LifeEventWithRelations | null; death: LifeEventWithRelations | null }>> {
    const map = new Map<
      string,
      { birth: LifeEventWithRelations | null; death: LifeEventWithRelations | null }
    >();
    for (const id of personProfileIds) {
      map.set(id, { birth: null, death: null });
    }
    if (personProfileIds.length === 0) {
      return map;
    }
    const rows = await prisma.lifeEvent.findMany({
      where: {
        userId,
        personProfileId: { in: personProfileIds },
        eventType: { in: ["BIRTH", "DEATH"] }
      },
      include: { place: true }
    });
    for (const row of rows) {
      if (!row.personProfileId) {
        continue;
      }
      const entry = map.get(row.personProfileId);
      if (!entry) {
        continue;
      }
      if (row.eventType === "BIRTH") {
        entry.birth = row as LifeEventWithRelations;
      } else if (row.eventType === "DEATH") {
        entry.death = row as LifeEventWithRelations;
      }
    }
    return map;
  }

  /**
   * Dual-write legacy PATCH /people fields into BIRTH/DEATH + Place.
   */
  async syncLegacyPersonProfileFields(
    userId: string,
    profileId: string,
    fields: {
      birthDate?: string | null;
      deathDate?: string | null;
      birthCity?: string | null;
      birthCountry?: string | null;
    }
  ): Promise<void> {
    const hasBirth =
      fields.birthDate !== undefined || fields.birthCity !== undefined || fields.birthCountry !== undefined;
    const hasDeath = fields.deathDate !== undefined;
    if (!hasBirth && !hasDeath) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (hasBirth) {
        await this.syncBirthEventTx(tx, userId, profileId, {
          birthDate: fields.birthDate,
          birthCity: fields.birthCity,
          birthCountry: fields.birthCountry
        });
      }
      if (hasDeath) {
        await this.syncDeathEventTx(tx, userId, profileId, { deathDate: fields.deathDate });
      }
    });
  }

  private async syncBirthEventTx(
    tx: Prisma.TransactionClient,
    userId: string,
    profileId: string,
    fields: {
      birthDate?: string | null;
      birthCity?: string | null;
      birthCountry?: string | null;
    }
  ) {
    const parts = parseIsoDateToParts(fields.birthDate ?? undefined);
    const city =
      fields.birthCity !== undefined
        ? fields.birthCity?.trim()
          ? fields.birthCity.trim()
          : null
        : undefined;
    const country =
      fields.birthCountry !== undefined
        ? fields.birthCountry?.trim()
          ? fields.birthCountry.trim()
          : null
        : undefined;

    const existing = await tx.lifeEvent.findFirst({
      where: { userId, personProfileId: profileId, eventType: "BIRTH" }
    });

    let placeId: string | null = existing?.placeId ?? null;
    if (city !== undefined || country !== undefined) {
      const name = [city ?? null, country ?? null].filter(Boolean).join(", ") || "Birth place";
      if (placeId) {
        await tx.place.update({
          where: { id: placeId },
          data: {
            name,
            locality: city ?? null,
            countryCode: country && country.length === 2 ? country : null
          }
        });
      } else if (city || country) {
        const place = await tx.place.create({
          data: {
            userId,
            name,
            locality: city ?? null,
            countryCode: country && country.length === 2 ? country : null
          }
        });
        placeId = place.id;
      }
    }

    const dateParts: PartialDateParts = parts
      ? { year: parts.year ?? null, month: parts.month ?? null, day: parts.day ?? null }
      : { year: null, month: null, day: null };

    if (!existing && !parts && !placeId) {
      return;
    }

    if (!existing) {
      await tx.lifeEvent.create({
        data: {
          userId,
          eventType: "BIRTH",
          dateQualifier: "EXACT",
          year: dateParts.year ?? null,
          month: dateParts.month ?? null,
          day: dateParts.day ?? null,
          endYear: null,
          endMonth: null,
          endDay: null,
          personProfileId: profileId,
          relationshipId: null,
          placeId,
          notes: null
        }
      });
      return;
    }

    await tx.lifeEvent.update({
      where: { id: existing.id },
      data: {
        ...(fields.birthDate !== undefined
          ? {
              year: dateParts.year ?? null,
              month: dateParts.month ?? null,
              day: dateParts.day ?? null
            }
          : {}),
        ...(fields.birthCity !== undefined || fields.birthCountry !== undefined ? { placeId } : {})
      }
    });
  }

  private async syncDeathEventTx(
    tx: Prisma.TransactionClient,
    userId: string,
    profileId: string,
    fields: { deathDate?: string | null }
  ) {
    const parts = parseIsoDateToParts(fields.deathDate ?? undefined);
    const existing = await tx.lifeEvent.findFirst({
      where: { userId, personProfileId: profileId, eventType: "DEATH" }
    });

    if (!parts && !existing) {
      return;
    }

    const dateParts: PartialDateParts = parts
      ? { year: parts.year ?? null, month: parts.month ?? null, day: parts.day ?? null }
      : { year: null, month: null, day: null };

    if (!existing) {
      await tx.lifeEvent.create({
        data: {
          userId,
          eventType: "DEATH",
          dateQualifier: "EXACT",
          year: dateParts.year ?? null,
          month: dateParts.month ?? null,
          day: dateParts.day ?? null,
          endYear: null,
          endMonth: null,
          endDay: null,
          personProfileId: profileId,
          relationshipId: null,
          placeId: null,
          notes: null
        }
      });
      return;
    }

    await tx.lifeEvent.update({
      where: { id: existing.id },
      data: {
        year: dateParts.year ?? null,
        month: dateParts.month ?? null,
        day: dateParts.day ?? null
      }
    });
  }

  /** Spouse dates → MARRIAGE / DIVORCE life events on one canonical SPOUSE_OF row per pair. */
  async syncLegacySpouseDates(
    userId: string,
    fromPersonId: string,
    toPersonId: string,
    spouseDates: { marriageAnniversaryDate?: string | null; divorceDate?: string | null }
  ): Promise<void> {
    const rel = await prisma.relationship.findFirst({
      where: {
        userId,
        type: "SPOUSE_OF",
        fromPersonId: fromPersonId < toPersonId ? fromPersonId : toPersonId,
        toPersonId: fromPersonId < toPersonId ? toPersonId : fromPersonId
      }
    });
    if (!rel) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (spouseDates.marriageAnniversaryDate !== undefined) {
        const parts = parseIsoDateToParts(spouseDates.marriageAnniversaryDate);
        const existing = await tx.lifeEvent.findFirst({
          where: { userId, relationshipId: rel.id, eventType: "MARRIAGE" }
        });
        if (parts) {
          if (existing) {
            await tx.lifeEvent.update({
              where: { id: existing.id },
              data: {
                year: parts.year ?? null,
                month: parts.month ?? null,
                day: parts.day ?? null
              }
            });
          } else {
            await tx.lifeEvent.create({
              data: {
                userId,
                eventType: "MARRIAGE",
                dateQualifier: "EXACT",
                year: parts.year ?? null,
                month: parts.month ?? null,
                day: parts.day ?? null,
                endYear: null,
                endMonth: null,
                endDay: null,
                personProfileId: null,
                relationshipId: rel.id,
                placeId: null,
                notes: null
              }
            });
          }
        } else if (existing) {
          await tx.lifeEvent.update({
            where: { id: existing.id },
            data: { year: null, month: null, day: null }
          });
        }
      }
      if (spouseDates.divorceDate !== undefined) {
        const parts = parseIsoDateToParts(spouseDates.divorceDate);
        const existing = await tx.lifeEvent.findFirst({
          where: { userId, relationshipId: rel.id, eventType: "DIVORCE" }
        });
        if (parts) {
          if (existing) {
            await tx.lifeEvent.update({
              where: { id: existing.id },
              data: {
                year: parts.year ?? null,
                month: parts.month ?? null,
                day: parts.day ?? null
              }
            });
          } else {
            await tx.lifeEvent.create({
              data: {
                userId,
                eventType: "DIVORCE",
                dateQualifier: "EXACT",
                year: parts.year ?? null,
                month: parts.month ?? null,
                day: parts.day ?? null,
                endYear: null,
                endMonth: null,
                endDay: null,
                personProfileId: null,
                relationshipId: rel.id,
                placeId: null,
                notes: null
              }
            });
          }
        } else if (existing) {
          await tx.lifeEvent.update({
            where: { id: existing.id },
            data: { year: null, month: null, day: null }
          });
        }
      }
    });
  }
}

export function lifeEventToJson(event: LifeEventWithRelations) {
  return {
    id: event.id,
    eventType: event.eventType,
    dateQualifier: event.dateQualifier,
    year: event.year,
    month: event.month,
    day: event.day,
    endYear: event.endYear,
    endMonth: event.endMonth,
    endDay: event.endDay,
    notes: event.notes,
    place: event.place
      ? {
          id: event.place.id,
          name: event.place.name,
          addressLine1: event.place.addressLine1,
          locality: event.place.locality,
          adminArea: event.place.adminArea,
          postalCode: event.place.postalCode,
          countryCode: event.place.countryCode,
          latitude: event.place.latitude != null ? Number(event.place.latitude) : null,
          longitude: event.place.longitude != null ? Number(event.place.longitude) : null,
          notes: event.place.notes
        }
      : null,
    citations: (event.citations ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      repository: c.repository,
      url: c.url,
      page: c.page,
      notes: c.notes,
      citedAt: c.citedAt
    })),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString()
  };
}

/** Effective birth ISO for merged GET /people birthDate field. */
export function effectiveBirthIsoFromBridge(
  birthEvent: (LifeEvent & { place?: Place | null }) | null | undefined,
  birthDateOverride: string | null | undefined,
  immichBirth: string | null | undefined
): string | null {
  const fromEvent = birthEvent ? isoFromLifeEventRow(birthEvent) : null;
  if (fromEvent) {
    return fromEvent;
  }
  if (birthDateOverride?.trim()) {
    return birthDateOverride.trim();
  }
  return immichBirth?.trim() ? immichBirth.trim() : null;
}
