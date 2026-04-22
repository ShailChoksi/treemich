import type { FastifyInstance } from "fastify";
import type { PersonName } from "@prisma/client";
import { getRequiredAuth } from "../auth/request.js";
import { effectiveBirthIsoFromLifeEvent } from "../lifeEvents/service.js";
import { resolveDisplayNameForPerson } from "../personNames/service.js";
import { getImmichClientForRequest } from "../services.js";

type ProfileRow = {
  id: string;
  displayNameOverride: string | null;
  givenName: string | null;
  surname: string | null;
};

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
    const [birthDeathByProfileId, primaryNameByProfileId] = await Promise.all([
      app.services.lifeEventService.getBirthDeathByPersonProfileIds(auth.user.id, profileInternalIds),
      app.services.personNameService.getPrimaryMapForProfileIds(auth.user.id, profileInternalIds)
    ]);

    return {
      people: people.map((person) => {
        const profile = profilesById.get(person.id) ?? null;
        const pr = profile as ProfileRow | null;
        const bd = profile ? birthDeathByProfileId.get((profile as ProfileRow).id) : undefined;
        const mergedBirth = effectiveBirthIsoFromLifeEvent(bd?.birth ?? null, person.birthDate);
        const primaryName: PersonName | null = pr ? (primaryNameByProfileId.get(pr.id) ?? null) : null;
        const displayName = resolveDisplayNameForPerson({
          immichName: person.name,
          displayNameOverride: pr?.displayNameOverride ?? null,
          givenName: pr?.givenName ?? null,
          surname: pr?.surname ?? null,
          primaryName: primaryName as PersonName | null
        });
        return {
          ...person,
          displayName: displayName === person.name ? null : displayName,
          birthDate: mergedBirth,
          profile: profile ?? null,
          hasRelationship: connectedIds.has(person.id)
        };
      })
    };
  });
};
