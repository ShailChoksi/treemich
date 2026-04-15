import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Gender } from "@prisma/client";
import { getRequiredAuth } from "../auth/request.js";
import { RuleBasedInterpreter } from "../search/interpreter/ruleBasedInterpreter.js";
import { getImmichClientForRequest } from "../services.js";

const querySchema = z.object({
  q: z.string().min(1)
});

export const registerSearchGetRoute = (app: FastifyInstance) => {
  const interpreter = new RuleBasedInterpreter();

  app.get("/search", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const { q } = querySchema.parse(request.query);
    const interpreted = interpreter.interpret(q);

    if (!interpreted.ok) {
      return reply.code(400).send(interpreted);
    }

    const allPeople = await getImmichClientForRequest(request).listPeople();
    const normalizedSourceName = interpreted.parsed.sourceName.trim().toLowerCase();
    const sourceCandidates = allPeople.filter((person) =>
      person.name.toLowerCase().includes(normalizedSourceName)
    );
    if (sourceCandidates.length === 0) {
      return {
        parsed: interpreted.parsed,
        sourceCandidates: [],
        matches: [],
        message: `No person found for ${interpreted.parsed.sourceName}`
      };
    }

    const sourceIds = sourceCandidates.map((person) => person.id);
    const relationshipHits = (await app.services.relationshipService.findTargetsByRelationship(
      auth.user.id,
      sourceIds,
      interpreted.parsed.relationshipType
    )) as Array<{ fromPersonId: string }>;

    const targetIds = [...new Set(relationshipHits.map((item) => item.fromPersonId))];
    const profilesById = (await app.services.relationshipService.getProfilesForPersonIds(
      auth.user.id,
      targetIds
    )) as Map<string, { gender: Gender }>;
    const peopleById = new Map(allPeople.map((person) => [person.id, person]));

    const matches = targetIds
      .map((personId) => {
        const person = peopleById.get(personId);
        if (!person) {
          return null;
        }

        const profile = profilesById.get(personId);
        return {
          person,
          profile
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter((item) => {
        if (!interpreted.parsed.requiredGender) {
          return true;
        }
        return item.profile?.gender === interpreted.parsed.requiredGender;
      });

    return {
      parsed: interpreted.parsed,
      sourceCandidates,
      matches
    };
  });
};
