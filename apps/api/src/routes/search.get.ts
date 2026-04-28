/**
 * @file Registers `GET /search` — natural-language relationship search using `RuleBasedInterpreter` and DB graph walk.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  Gender,
  LifeEvent,
  PersonExternalIdentity,
  PersonProfile,
  PersonThumbnail
} from "@prisma/client";
import type { PersonRecord } from "@treemich/shared";
import type { AgeFilter, InterpreterIntent } from "@treemich/shared/search/interpreter";
import { getRequiredAuth } from "../auth/request.js";
import { prisma } from "../db/client.js";
import { partialDateToComparableDate } from "../lifeEvents/dateValue.js";
import { parseUserPreferences } from "../preferences.js";
import { RuleBasedInterpreter } from "../search/interpreter/ruleBasedInterpreter.js";
import { personToJson } from "../people/service.js";

const querySchema = z.object({
  q: z.string().min(1)
});

type SearchPersonRow = PersonProfile & {
  externalIdentities: PersonExternalIdentity[];
  personNames: Array<{
    prefix: string | null;
    givenName: string | null;
    surname: string | null;
    suffix: string | null;
  }>;
  thumbnails: PersonThumbnail[];
};

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

const adoptedSearchIntents = new Set<InterpreterIntent>([
  "FIND_ADOPTED_CHILDREN",
  "FIND_ADOPTED_SONS",
  "FIND_ADOPTED_DAUGHTERS"
]);

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

const compactLower = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim().toLowerCase()).filter((value): value is string => Boolean(value));

const formatNameParts = (parts: Array<string | null | undefined>) => parts.filter(Boolean).join(" ").trim();

const alternateNameText = (name: SearchPersonRow["personNames"][number]) =>
  formatNameParts([name.prefix, name.givenName, name.surname, name.suffix]);

const searchTextsForPerson = (
  row: SearchPersonRow,
  person: PersonRecord,
  options: { includeAlternateNames: boolean }
) => {
  const texts = compactLower([
    person.name,
    person.displayName,
    row.displayNameOverride,
    row.givenName,
    row.surname,
    row.nicknames,
    formatNameParts([row.givenName, row.surname]),
    ...row.externalIdentities.map((identity) => identity.displayName)
  ]);
  if (options.includeAlternateNames) {
    texts.push(...compactLower(row.personNames.map(alternateNameText)));
  }
  return texts;
};

const loadSearchPeople = async (userId: string) => {
  const rows = (await prisma.personProfile.findMany({
    where: { userId },
    include: {
      externalIdentities: true,
      personNames: {
        select: {
          prefix: true,
          givenName: true,
          surname: true,
          suffix: true
        }
      },
      thumbnails: { orderBy: { updatedAt: "desc" }, take: 1 }
    },
    orderBy: [{ surname: "asc" }, { givenName: "asc" }, { createdAt: "asc" }]
  })) as SearchPersonRow[];

  return rows.map((row) => ({
    row,
    person: personToJson(row)
  }));
};

export const registerSearchGetRoute = (app: FastifyInstance) => {
  const interpreter = new RuleBasedInterpreter();

  app.get("/search", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { q } = querySchema.parse(request.query);
    const interpreted = interpreter.interpret(q);

    if (!interpreted.ok) {
      return reply.code(400).send(interpreted);
    }

    const userRow = await prisma.treemichUser.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { preferences: true }
    });
    const includeAlternateNames =
      parseUserPreferences(userRow.preferences).searchIncludeAlternateNames === true;
    const normalizedSourceName = interpreted.parsed.sourceName.trim().toLowerCase();
    const searchablePeople = await loadSearchPeople(auth.user.id);
    const sourceCandidates = searchablePeople
      .filter(({ row, person }) =>
        searchTextsForPerson(row, person, { includeAlternateNames }).some((text) =>
          text.includes(normalizedSourceName)
        )
      )
      .map(({ person }) => person);
    if (sourceCandidates.length === 0) {
      return {
        parsed: interpreted.parsed,
        sourceCandidates: [],
        matches: [],
        message: `No person found for ${interpreted.parsed.sourceName}`
      };
    }

    const sourceIds = sourceCandidates.map((person) => person.id);
    const targetIds = adoptedSearchIntents.has(interpreted.parsed.intent)
      ? await app.services.familyService.findAdoptedChildPersonIds(auth.user.id, sourceIds)
      : await app.services.relationshipService.traverseRelationshipChain(
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
    const peopleById = new Map(searchablePeople.map(({ person }) => [person.id, person]));
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
