import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Gender, LifeEvent } from "@prisma/client";
import type { AgeFilter } from "@treemich/shared/search/interpreter";
import { getRequiredAuth } from "../auth/request.js";
import { prisma } from "../db/client.js";
import { partialDateToComparableDate } from "../lifeEvents/dateValue.js";
import { parseUserPreferences } from "../preferences.js";
import { RuleBasedInterpreter } from "../search/interpreter/ruleBasedInterpreter.js";
import { getImmichClientForRequest } from "../services.js";

const querySchema = z.object({
  q: z.string().min(1)
});

function resolveBirthDate(
  birthEvent?: Pick<LifeEvent, "year" | "month" | "day"> | null,
  immichPerson?: { birthDate?: string | null }
): Date | null {
  if (birthEvent && birthEvent.year != null) {
    const fromEvent = partialDateToComparableDate({
      year: birthEvent.year,
      month: birthEvent.month,
      day: birthEvent.day
    });
    if (fromEvent) {
      return fromEvent;
    }
  }
  const raw = immichPerson?.birthDate;
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computeAge(birthDate: Date, now: Date): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

function matchesAgeFilter(birthDate: Date, filter: AgeFilter, now: Date): boolean {
  switch (filter.kind) {
    case "minAge":
      return computeAge(birthDate, now) >= filter.years;
    case "maxAge":
      return computeAge(birthDate, now) < filter.years;
    case "ageRange": {
      const age = computeAge(birthDate, now);
      return age >= filter.min && age <= filter.max;
    }
    case "bornAfter":
      return birthDate.getFullYear() > filter.year;
    case "bornBefore":
      return birthDate.getFullYear() < filter.year;
    case "bornInYear":
      return birthDate.getFullYear() === filter.year;
  }
}

export const registerSearchGetRoute = (app: FastifyInstance) => {
  const interpreter = new RuleBasedInterpreter();

  app.get("/search", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { q } = querySchema.parse(request.query);
    const interpreted = interpreter.interpret(q);

    if (!interpreted.ok) {
      return reply.code(400).send(interpreted);
    }

    const allPeople = await (await getImmichClientForRequest(request)).listPeople();
    const userRow = await prisma.treemichUser.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { preferences: true }
    });
    const includeAlternateNames =
      parseUserPreferences(userRow.preferences).searchIncludeAlternateNames === true;
    const alternateNameTextsByPerson = includeAlternateNames
      ? await app.services.personNameService.getAllFormattedForUser(auth.user.id)
      : new Map<string, string[]>();
    const normalizedSourceName = interpreted.parsed.sourceName.trim().toLowerCase();
    const sourceNameMatches = (nameLower: string) => nameLower.includes(normalizedSourceName);
    const sourceCandidates = allPeople.filter((person) => {
      if (sourceNameMatches(person.name.toLowerCase())) {
        return true;
      }
      if (!includeAlternateNames) {
        return false;
      }
      const alts = alternateNameTextsByPerson.get(person.id);
      return alts != null && alts.some((t) => sourceNameMatches(t));
    });
    if (sourceCandidates.length === 0) {
      return {
        parsed: interpreted.parsed,
        sourceCandidates: [],
        matches: [],
        message: `No person found for ${interpreted.parsed.sourceName}`
      };
    }

    const sourceIds = sourceCandidates.map((person) => person.id);
    const targetIds = await app.services.relationshipService.traverseRelationshipChain(
      auth.user.id,
      sourceIds,
      interpreted.parsed.hops
    );

    const profilesById = (await app.services.relationshipService.getProfilesForPersonIds(
      auth.user.id,
      targetIds
    )) as Map<string, { id: string; gender: Gender }>;
    const profileInternalIds = [
      ...new Set(
        [...profilesById.values()]
          .map((p) =>
            "id" in p && typeof (p as { id?: string }).id === "string" ? (p as { id: string }).id : null
          )
          .filter((id): id is string => id != null)
      )
    ];
    const birthDeathByProfileId = await app.services.lifeEventService.getBirthDeathByPersonProfileIds(
      auth.user.id,
      profileInternalIds
    );
    const peopleById = new Map(allPeople.map((person) => [person.id, person]));
    const now = new Date();

    const matches = targetIds
      .map((personId) => {
        const person = peopleById.get(personId);
        if (!person) {
          return null;
        }
        const profile = profilesById.get(personId);
        return { person, profile };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter((item) => {
        if (!interpreted.parsed.requiredGender) {
          return true;
        }
        return item.profile?.gender === interpreted.parsed.requiredGender;
      })
      .filter((item) => {
        if (!interpreted.parsed.ageFilter) {
          return true;
        }
        const birthRow = item.profile ? birthDeathByProfileId.get(item.profile.id) : undefined;
        const birthDate = resolveBirthDate(birthRow?.birth ?? null, item.person);
        if (!birthDate) {
          return false;
        }
        return matchesAgeFilter(birthDate, interpreted.parsed.ageFilter, now);
      });

    return {
      parsed: interpreted.parsed,
      sourceCandidates,
      matches
    };
  });
};
