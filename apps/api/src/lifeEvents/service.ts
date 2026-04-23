import {
  type DateQualifier,
  type LifeEventType,
  type Prisma,
  type Place,
  type LifeEvent
} from "@prisma/client";
import type { CreateLifeEventBody, PatchLifeEventBody, PlaceInput } from "@treemich/shared";
import { prisma } from "../db/client.js";
import { replaceLifeEventCitations } from "./citationWrite.js";
import { isProfilePlaceGeocodingEnabled } from "../config/env.js";
import { HttpConflictError, HttpNotFoundError, HttpValidationError } from "./errors.js";
import {
  parseIsoDateToParts,
  partialDateToIsoString,
  validatePartialDateTriplet,
  type PartialDateParts
} from "./dateValue.js";
import { computePersonLifeEventFindings } from "./personLifeEventValidation.js";

const isoFromLifeEventRow = (event: Pick<LifeEvent, "year" | "month" | "day">) =>
  partialDateToIsoString({
    year: event.year,
    month: event.month,
    day: event.day
  });

const relationshipScopedTypes: LifeEventType[] = ["MARRIAGE", "DIVORCE"];

/** Default Prisma include for life-event API responses (nested source + repository for citations). */
export const lifeEventQueryInclude = {
  place: true,
  citations: { include: { source: { include: { repository: true } } } }
} as const satisfies Prisma.LifeEventInclude;

export type LifeEventWithRelations = Prisma.LifeEventGetPayload<{
  include: typeof lifeEventQueryInclude;
}>;

export class LifeEventService {
  private normalizeText(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private buildBirthGeocodeQuery(city: string | null, country: string | null): string | null {
    const parts = [city, country].filter((part): part is string => Boolean(part?.trim()));
    if (parts.length === 0) {
      return null;
    }
    return parts.join(", ");
  }

  private async geocodeBirthPlace(
    city: string | null,
    country: string | null
  ): Promise<{ latitude: number; longitude: number } | null> {
    const query = this.buildBirthGeocodeQuery(city, country);
    if (!query) {
      return null;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Treemich/1.0 (+https://github.com/treemich/treemich)"
          },
          signal: controller.signal
        }
      );
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as Array<{ lat?: string; lon?: string }>;
      const first = body[0];
      if (!first) {
        return null;
      }
      const latitude = Number(first.lat);
      const longitude = Number(first.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return { latitude, longitude };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractCityFromCommaName(name: string): string | null {
    const trimmed = name?.trim();
    if (!trimmed) {
      return null;
    }
    const idx = trimmed.indexOf(",");
    if (idx >= 0) {
      const left = trimmed.slice(0, idx).trim();
      return left || null;
    }
    return trimmed;
  }

  private extractCountryFromCommaName(name: string, locality: string | null): string | null {
    const trimmed = name?.trim();
    if (!trimmed) {
      return null;
    }
    const loc = locality?.trim();
    if (loc) {
      const prefix = `${loc},`;
      if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        const rest = trimmed.slice(prefix.length).trim();
        return rest || null;
      }
    }
    const idx = trimmed.indexOf(",");
    if (idx >= 0) {
      return trimmed.slice(idx + 1).trim() || null;
    }
    return null;
  }

  private placeHintsFromStoredBirthPlace(place: {
    name: string;
    locality: string | null;
    countryCode: string | null;
    adminArea: string | null;
  }): { birthCity: string | null; birthCountry: string | null } {
    const locality = this.normalizeText(place.locality);
    const birthCity = locality ?? this.normalizeText(this.extractCityFromCommaName(place.name));
    const birthCountry =
      this.normalizeText(place.countryCode) ??
      this.normalizeText(place.adminArea) ??
      this.normalizeText(this.extractCountryFromCommaName(place.name, place.locality));
    return { birthCity, birthCountry };
  }

  private async maybeBackfillBirthPlaceCoordinates(
    userId: string,
    profileId: string,
    fields: { birthCity?: string | null; birthCountry?: string | null }
  ): Promise<void> {
    const birth = await prisma.lifeEvent.findFirst({
      where: { userId, personProfileId: profileId, eventType: "BIRTH" },
      include: { place: true }
    });
    const place = birth?.place;
    if (!place) {
      return;
    }
    if (place.latitude != null && place.longitude != null) {
      return;
    }

    const hints = this.placeHintsFromStoredBirthPlace(place);
    const city = this.normalizeText(
      (fields.birthCity !== undefined ? fields.birthCity : undefined) ?? hints.birthCity ?? undefined
    );
    const country = this.normalizeText(
      (fields.birthCountry !== undefined ? fields.birthCountry : undefined) ?? hints.birthCountry ?? undefined
    );
    if (!city && !country) {
      return;
    }

    const countryCode = country && country.length === 2 ? country.toUpperCase() : null;
    const existingPlace = await prisma.place.findFirst({
      where: {
        userId,
        NOT: { id: place.id },
        latitude: { not: null },
        longitude: { not: null },
        ...(city ? { locality: { equals: city, mode: "insensitive" } } : {}),
        ...(countryCode ? { countryCode } : {})
      }
    });
    if (existingPlace?.latitude != null && existingPlace.longitude != null) {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          latitude: existingPlace.latitude,
          longitude: existingPlace.longitude
        }
      });
      return;
    }

    if (!isProfilePlaceGeocodingEnabled()) {
      return;
    }
    const geocoded = await this.geocodeBirthPlace(city, country);
    if (!geocoded) {
      return;
    }
    await prisma.place.update({
      where: { id: place.id },
      data: {
        latitude: geocoded.latitude,
        longitude: geocoded.longitude
      }
    });
  }

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

  private async assertNoDuplicateRelationshipEvent(
    userId: string,
    relationshipId: string,
    eventType: LifeEventType,
    excludeEventId?: string
  ) {
    if (eventType !== "MARRIAGE" && eventType !== "DIVORCE") {
      return;
    }
    const existing = await prisma.lifeEvent.findFirst({
      where: {
        userId,
        relationshipId,
        eventType,
        ...(excludeEventId ? { NOT: { id: excludeEventId } } : {})
      }
    });
    if (existing) {
      throw new HttpConflictError(`A ${eventType} event already exists for this relationship`);
    }
  }

  async validatePersonLifeEvents(
    userId: string,
    immichPersonId: string
  ): Promise<{ findings: ReturnType<typeof computePersonLifeEventFindings> }> {
    const events = await this.listPersonLifeEvents(userId, immichPersonId, { includeCitations: false });
    const findings = computePersonLifeEventFindings(
      events.map((e) => ({
        eventType: e.eventType,
        year: e.year,
        month: e.month,
        day: e.day
      })),
      { immichPersonId }
    );
    return { findings };
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
        ...(options?.includeCitations === false ? {} : { citations: lifeEventQueryInclude.citations })
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

    const createdRow = (await prisma.$transaction(async (tx) => {
      const row = await tx.lifeEvent.create({
        data: {
          userId,
          eventType: body.eventType,
          ...dateData,
          personProfileId: profile.id,
          relationshipId: null,
          placeId,
          notes: body.notes ?? null
        }
      });
      await replaceLifeEventCitations(tx, userId, row.id, body.citations);
      return tx.lifeEvent.findFirstOrThrow({
        where: { id: row.id },
        include: lifeEventQueryInclude
      });
    })) as LifeEventWithRelations;
    await this.maybeBackfillBirthPlaceCoordinates(userId, profile.id, {});
    return createdRow;
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

    const updatedRow = (await prisma.$transaction(async (tx) => {
      await tx.lifeEvent.update({
        where: { id: eventId },
        data: {
          ...(body.eventType ? { eventType: body.eventType } : {}),
          ...(dateData ? dateData : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(placeId !== undefined ? { placeId } : {})
        }
      });
      if (body.citations !== undefined) {
        await replaceLifeEventCitations(tx, userId, eventId, body.citations);
      }
      return tx.lifeEvent.findFirstOrThrow({
        where: { id: eventId },
        include: lifeEventQueryInclude
      });
    })) as LifeEventWithRelations;
    await this.maybeBackfillBirthPlaceCoordinates(userId, profile.id, {});
    return updatedRow;
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
        ...(options?.includeCitations === false ? {} : { citations: lifeEventQueryInclude.citations })
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
    await this.assertNoDuplicateRelationshipEvent(userId, relationshipId, body.eventType);
    const placeId = await this.resolvePlaceId(userId, body.placeId ?? null, body.place ?? null);
    const dateData = this.buildDateData(body);
    const created = (await prisma.$transaction(async (tx) => {
      const row = await tx.lifeEvent.create({
        data: {
          userId,
          eventType: body.eventType,
          ...dateData,
          personProfileId: null,
          relationshipId,
          placeId,
          notes: body.notes ?? null
        }
      });
      await replaceLifeEventCitations(tx, userId, row.id, body.citations);
      return tx.lifeEvent.findFirstOrThrow({
        where: { id: row.id },
        include: lifeEventQueryInclude
      });
    })) as LifeEventWithRelations;
    return created;
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
      if (body.eventType !== existing.eventType) {
        await this.assertNoDuplicateRelationshipEvent(userId, relationshipId, body.eventType, eventId);
      }
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

    const updated = (await prisma.$transaction(async (tx) => {
      await tx.lifeEvent.update({
        where: { id: eventId },
        data: {
          ...(body.eventType ? { eventType: body.eventType } : {}),
          ...(dateData ? dateData : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(placeId !== undefined ? { placeId } : {})
        }
      });
      if (body.citations !== undefined) {
        await replaceLifeEventCitations(tx, userId, eventId, body.citations);
      }
      return tx.lifeEvent.findFirstOrThrow({
        where: { id: eventId },
        include: lifeEventQueryInclude
      });
    })) as LifeEventWithRelations;
    return updated;
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
   * Apply PATCH /people date and birth-place fields to BIRTH / DEATH life events (and linked Place).
   * Legacy DB columns on PersonProfile were removed; this is the only persistence path for these inputs.
   */
  async syncPersonProfileFieldsToLifeEvents(
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
    if (hasBirth) {
      await this.maybeBackfillBirthPlaceCoordinates(userId, profileId, {
        birthCity: fields.birthCity,
        birthCountry: fields.birthCountry
      });
    }
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
      const existingPlaceRow = placeId != null ? await tx.place.findUnique({ where: { id: placeId } }) : null;

      const nextLocality =
        city !== undefined ? (city?.trim() ? city.trim() : null) : (existingPlaceRow?.locality ?? null);

      const nextCountryRaw =
        country !== undefined
          ? country?.trim()
            ? country.trim()
            : null
          : existingPlaceRow?.countryCode?.trim() || existingPlaceRow?.adminArea?.trim() || null;

      const name = [nextLocality, nextCountryRaw].filter(Boolean).join(", ") || "Birth place";
      const countryCode = nextCountryRaw && nextCountryRaw.length === 2 ? nextCountryRaw.toUpperCase() : null;
      const adminArea = nextCountryRaw && nextCountryRaw.length !== 2 ? nextCountryRaw : null;

      if (placeId) {
        await tx.place.update({
          where: { id: placeId },
          data: {
            name,
            locality: nextLocality,
            countryCode,
            adminArea
          }
        });
      } else if (nextLocality || nextCountryRaw) {
        const place = await tx.place.create({
          data: {
            userId,
            name,
            locality: nextLocality,
            countryCode,
            adminArea
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

  /** Map spouse date fields from relationship APIs to MARRIAGE / DIVORCE life events (canonical SPOUSE_OF row). */
  async syncSpouseDatesToLifeEvents(
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

  /**
   * Marriage/divorce ISO dates from life events for SPOUSE_OF edges, keyed as `${lo}:${hi}`
   * with `lo < hi` lexicographically (matches `RelationshipService.listRelationships` lookups).
   * Queries both directions of each pair; merges when two directed spouse rows exist.
   */
  async getSpouseMarriageDivorceIsoForPairs(
    userId: string,
    pairs: ReadonlyArray<{ lo: string; hi: string }>
  ): Promise<Map<string, { marriageAnniversaryDate: string | null; divorceDate: string | null }>> {
    const pairKey = (lo: string, hi: string) => `${lo}:${hi}`;
    const normalizedPairKey = (a: string, b: string) => pairKey(a < b ? a : b, a < b ? b : a);
    const out = new Map<string, { marriageAnniversaryDate: string | null; divorceDate: string | null }>();
    const uniquePairs = [...new Map(pairs.map((p) => [pairKey(p.lo, p.hi), p])).values()];
    if (uniquePairs.length === 0) {
      return out;
    }

    const rels = await prisma.relationship.findMany({
      where: {
        userId,
        type: "SPOUSE_OF",
        OR: uniquePairs.flatMap(({ lo, hi }) => [
          { fromPersonId: lo, toPersonId: hi },
          { fromPersonId: hi, toPersonId: lo }
        ])
      },
      select: { id: true, fromPersonId: true, toPersonId: true }
    });

    const relIds = rels.map((r) => r.id);
    if (relIds.length === 0) {
      for (const { lo, hi } of uniquePairs) {
        out.set(pairKey(lo, hi), { marriageAnniversaryDate: null, divorceDate: null });
      }
      return out;
    }

    const events = await prisma.lifeEvent.findMany({
      where: {
        userId,
        relationshipId: { in: relIds },
        eventType: { in: ["MARRIAGE", "DIVORCE"] }
      },
      select: { relationshipId: true, eventType: true, year: true, month: true, day: true }
    });

    const byRel = new Map<string, { marriage: string | null; divorce: string | null }>();
    for (const rid of relIds) {
      byRel.set(rid, { marriage: null, divorce: null });
    }
    for (const e of events) {
      if (!e.relationshipId) {
        continue;
      }
      const bucket = byRel.get(e.relationshipId);
      if (!bucket) {
        continue;
      }
      const iso = isoFromLifeEventRow(e);
      if (e.eventType === "MARRIAGE") {
        bucket.marriage = iso;
      } else {
        bucket.divorce = iso;
      }
    }

    for (const rel of rels) {
      const pk = normalizedPairKey(rel.fromPersonId, rel.toPersonId);
      const bucket = byRel.get(rel.id);
      const existing = out.get(pk);
      out.set(pk, {
        marriageAnniversaryDate: existing?.marriageAnniversaryDate ?? bucket?.marriage ?? null,
        divorceDate: existing?.divorceDate ?? bucket?.divorce ?? null
      });
    }

    for (const { lo, hi } of uniquePairs) {
      const pk = pairKey(lo, hi);
      if (!out.has(pk)) {
        out.set(pk, { marriageAnniversaryDate: null, divorceDate: null });
      }
    }

    return out;
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
    citations: (event.citations ?? []).map((c) => {
      const s = c.source;
      return {
        id: c.id,
        sourceId: c.sourceId,
        title: s.title,
        repository: s.repository?.name ?? null,
        url: s.url,
        page: c.page,
        notes: c.notes,
        citedAt: c.citedAt,
        source: {
          id: s.id,
          title: s.title,
          repositoryId: s.repositoryId,
          repository: s.repository
            ? { id: s.repository.id, name: s.repository.name }
            : null
        }
      };
    }),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString()
  };
}

/** Effective birth ISO for GET /people: life event first, then Immich person birthDate. */
export function effectiveBirthIsoFromLifeEvent(
  birthEvent: (LifeEvent & { place?: Place | null }) | null | undefined,
  immichBirth: string | null | undefined
): string | null {
  const fromEvent = birthEvent ? isoFromLifeEventRow(birthEvent) : null;
  if (fromEvent) {
    return fromEvent;
  }
  return immichBirth?.trim() ? immichBirth.trim() : null;
}
