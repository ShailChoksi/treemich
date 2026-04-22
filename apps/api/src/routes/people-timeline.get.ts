/**
 * @file Registers `GET /people/:id/timeline` — chronological merged life events for sidebar timeline.
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { lifeEventDateSortKey } from "../lifeEvents/dateValue.js";
import { lifeEventToJson } from "../lifeEvents/service.js";

const personParamsSchema = z.object({
  id: z.string().min(1)
});

export const registerPeopleTimelineGetRoute = (app: FastifyInstance) => {
  app.get("/people/:id/timeline", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = personParamsSchema.parse(request.params);
    const events = await app.services.lifeEventService.listPersonLifeEvents(auth.user.id, id, {
      includeCitations: false
    });
    const timeline = events
      .map((event) => ({
        ...lifeEventToJson(event),
        dateSortKey: lifeEventDateSortKey({
          year: event.year,
          month: event.month,
          day: event.day
        })
      }))
      .sort(
        (left, right) => left.dateSortKey - right.dateSortKey || left.eventType.localeCompare(right.eventType)
      );
    return { timeline };
  });
};
