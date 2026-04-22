/**
 * @file Registers `GET /places/map` — geocoded life-event place aggregates for the map UI.
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { prisma } from "../db/client.js";
import { isMapUiEnabled } from "../config/env.js";

const querySchema = z.object({
  includeLiving: z.enum(["true", "false"]).optional()
});

type PlaceAggregate = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  eventCount: number;
  personCount: number;
  lastEventYear: number | null;
};

export const registerPlacesMapGetRoute = (app: FastifyInstance) => {
  app.get("/places/map", async (request) => {
    const auth = getRequiredAuth(request);
    const { includeLiving } = querySchema.parse(request.query);
    const mapUiEnabled = isMapUiEnabled();
    if (!mapUiEnabled) {
      return { mapUiEnabled: false as const, places: [] as PlaceAggregate[] };
    }

    const includeLivingPeople = includeLiving !== "false";
    const events = await prisma.lifeEvent.findMany({
      where: {
        userId: auth.user.id,
        place: {
          latitude: { not: null },
          longitude: { not: null }
        }
      },
      select: {
        year: true,
        personProfile: {
          select: {
            immichPersonId: true
          }
        },
        place: {
          select: {
            id: true,
            name: true,
            latitude: true,
            longitude: true
          }
        }
      }
    });

    const deceasedProfileIds = (
      await prisma.lifeEvent.findMany({
        where: {
          userId: auth.user.id,
          eventType: "DEATH",
          personProfileId: { not: null }
        },
        select: { personProfileId: true }
      })
    )
      .map((row) => row.personProfileId)
      .filter((value): value is string => value != null);
    const deceasedProfiles =
      deceasedProfileIds.length > 0
        ? await prisma.personProfile.findMany({
            where: { id: { in: deceasedProfileIds } },
            select: { immichPersonId: true }
          })
        : [];
    const deceased = new Set<string>(deceasedProfiles.map((row) => row.immichPersonId));

    const byPlace = new Map<string, PlaceAggregate & { personIds: Set<string> }>();
    for (const event of events) {
      const place = event.place;
      if (!place || place.latitude == null || place.longitude == null) {
        continue;
      }
      const immichPersonId = event.personProfile?.immichPersonId ?? null;
      if (!includeLivingPeople && immichPersonId && !deceased.has(immichPersonId)) {
        continue;
      }
      const existing = byPlace.get(place.id) ?? {
        id: place.id,
        name: place.name,
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
        eventCount: 0,
        personCount: 0,
        lastEventYear: null as number | null,
        personIds: new Set<string>()
      };
      existing.eventCount += 1;
      if (immichPersonId) {
        existing.personIds.add(immichPersonId);
      }
      if (event.year != null && (existing.lastEventYear == null || event.year > existing.lastEventYear)) {
        existing.lastEventYear = event.year;
      }
      byPlace.set(place.id, existing);
    }

    const places = [...byPlace.values()]
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        latitude: entry.latitude,
        longitude: entry.longitude,
        eventCount: entry.eventCount,
        personCount: entry.personIds.size,
        lastEventYear: entry.lastEventYear,
        samplePersonIds: [...entry.personIds].sort((left, right) => left.localeCompare(right)).slice(0, 5)
      }))
      .sort((left, right) => right.eventCount - left.eventCount || left.name.localeCompare(right.name));

    return { mapUiEnabled: true as const, places };
  });
};
