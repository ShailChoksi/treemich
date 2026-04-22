import type { FastifyInstance } from "fastify";
import { getRequiredAuth } from "../auth/request.js";
import { effectiveBirthIsoFromLifeEvent } from "../lifeEvents/service.js";
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

    const profileRows = [...profilesById.values()];
    const profileInternalIds = profileRows
      .map((p) =>
        "id" in p && typeof (p as { id?: string }).id === "string" ? (p as { id: string }).id : null
      )
      .filter((id): id is string => id != null);
    const birthDeathByProfileId = await app.services.lifeEventService.getBirthDeathByPersonProfileIds(
      auth.user.id,
      profileInternalIds
    );

    return {
      people: people.map((person) => {
        const profile = profilesById.get(person.id) ?? null;
        const bd = profile ? birthDeathByProfileId.get(profile.id) : undefined;
        const mergedBirth = effectiveBirthIsoFromLifeEvent(bd?.birth ?? null, person.birthDate);
        return {
          ...person,
          birthDate: mergedBirth,
          profile: profile ?? null,
          hasRelationship: connectedIds.has(person.id)
        };
      })
    };
  });
};
