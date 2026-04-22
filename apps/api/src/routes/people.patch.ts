import { Gender } from "@prisma/client";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";

const paramsSchema = z.object({
  id: z.string().min(1)
});

const bodySchema = z
  .object({
    gender: z.nativeEnum(Gender).optional(),
    birthDate: z.string().optional().nullable(),
    givenName: z.string().optional().nullable(),
    surname: z.string().optional().nullable(),
    nicknames: z.string().optional().nullable(),
    deathDate: z.string().optional().nullable(),
    birthCity: z.string().optional().nullable(),
    birthCountry: z.string().optional().nullable()
  })
  .refine(
    (body) =>
      body.gender !== undefined ||
      body.birthDate !== undefined ||
      body.givenName !== undefined ||
      body.surname !== undefined ||
      body.nicknames !== undefined ||
      body.deathDate !== undefined ||
      body.birthCity !== undefined ||
      body.birthCountry !== undefined,
    {
      message: "At least one profile field must be provided"
    }
  );

export const registerPeoplePatchRoute = (app: FastifyInstance) => {
  app.patch("/people/:id", async (request) => {
    const auth = getRequiredAuth(request);
    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);
    const normalizeOptionalString = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() ? value.trim() : null;

    const birthDate = normalizeOptionalString(body.birthDate);
    const deathDate = normalizeOptionalString(body.deathDate);
    const birthCity = normalizeOptionalString(body.birthCity);
    const birthCountry = normalizeOptionalString(body.birthCountry);

    const profile = await app.services.relationshipService.upsertProfile(auth.user.id, id, {
      ...(body.gender !== undefined ? { gender: body.gender } : {}),
      ...(body.givenName !== undefined ? { givenName: normalizeOptionalString(body.givenName) } : {}),
      ...(body.surname !== undefined ? { surname: normalizeOptionalString(body.surname) } : {}),
      ...(body.nicknames !== undefined ? { nicknames: normalizeOptionalString(body.nicknames) } : {})
    });

    if (
      birthDate !== undefined ||
      deathDate !== undefined ||
      birthCity !== undefined ||
      birthCountry !== undefined
    ) {
      await app.services.lifeEventService.syncPersonProfileFieldsToLifeEvents(auth.user.id, profile.id, {
        ...(birthDate !== undefined ? { birthDate: birthDate } : {}),
        ...(deathDate !== undefined ? { deathDate: deathDate } : {}),
        ...(birthCity !== undefined ? { birthCity: birthCity } : {}),
        ...(birthCountry !== undefined ? { birthCountry: birthCountry } : {})
      });
    }

    return profile;
  });
};
