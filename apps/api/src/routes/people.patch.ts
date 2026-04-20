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
    const profileUpdates: {
      gender?: Gender;
      birthDateOverride?: string | null;
      givenName?: string | null;
      surname?: string | null;
      nicknames?: string | null;
      deathDate?: string | null;
      birthCity?: string | null;
      birthCountry?: string | null;
    } = {};
    if (body.gender !== undefined) {
      profileUpdates.gender = body.gender;
    }
    const birthDateOverride = normalizeOptionalString(body.birthDate);
    if (birthDateOverride !== undefined) {
      profileUpdates.birthDateOverride = birthDateOverride;
    }
    const givenName = normalizeOptionalString(body.givenName);
    if (givenName !== undefined) {
      profileUpdates.givenName = givenName;
    }
    const surname = normalizeOptionalString(body.surname);
    if (surname !== undefined) {
      profileUpdates.surname = surname;
    }
    const nicknames = normalizeOptionalString(body.nicknames);
    if (nicknames !== undefined) {
      profileUpdates.nicknames = nicknames;
    }
    const deathDate = normalizeOptionalString(body.deathDate);
    if (deathDate !== undefined) {
      profileUpdates.deathDate = deathDate;
    }
    const birthCity = normalizeOptionalString(body.birthCity);
    if (birthCity !== undefined) {
      profileUpdates.birthCity = birthCity;
    }
    const birthCountry = normalizeOptionalString(body.birthCountry);
    if (birthCountry !== undefined) {
      profileUpdates.birthCountry = birthCountry;
    }
    return app.services.relationshipService.upsertProfile(auth.user.id, id, {
      ...profileUpdates
    });
  });
};
