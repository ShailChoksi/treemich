import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { getImmichClientForRequest } from "../services.js";

export const registerPeopleGetRoute = (app: FastifyInstance) => {
  app.get("/people", async (request) => {
    const auth = getRequiredAuth(request);
    const people = await getImmichClientForRequest(request).listPeople();
    const personIds = people.map((person) => person.id);
    const profilesById = await app.services.relationshipService.getProfilesForPersonIds(auth.user.id, personIds);
    const connectedIds = await app.services.relationshipService.getConnectedPersonIds(auth.user.id, personIds);

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
