import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { getImmichClientForRequest } from "../services.js";

export const registerPeopleGetRoute = (app: FastifyInstance) => {
  app.get("/people", async (request) => {
    const auth = getRequiredAuth(request);
    const people = await (await getImmichClientForRequest(request)).listPeople();
    const personIds = people.map((person) => person.id);
    const [profilesById, connectedIds] = await Promise.all([
      app.services.relationshipService.getProfilesForPersonIds(auth.user.id, personIds),
      app.services.relationshipService.getConnectedPersonIds(auth.user.id, personIds)
    ]);

    return {
      people: people.map((person) => ({
        ...person,
        birthDate: profilesById.get(person.id)?.birthDateOverride ?? person.birthDate ?? null,
        profile: profilesById.get(person.id) ?? null,
        hasRelationship: connectedIds.has(person.id)
      }))
    };
  });
};
