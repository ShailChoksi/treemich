/**
 * @file Optional Immich provider import routes.
 */

import type { FastifyInstance } from "fastify";
import {
  immichPeopleImportBodySchema,
  immichThumbnailImportBodySchema,
  type GenderValue,
  type ImmichImportCandidate,
  type ImmichImportPreviewRow
} from "@treemich/shared";
import { prisma } from "../db/client.js";
import { importImmichThumbnailForIdentity } from "../integrations/immich/importProvider.js";
import { getRequiredAuth } from "../auth/request.js";
import { getImmichClientForRequest } from "../services.js";

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const [givenName, ...surnameParts] = parts;
  return {
    givenName: givenName ?? "Person",
    surname: surnameParts.join(" ") || null
  };
};

const normalizeName = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const candidateScore = (immichName: string, personName: string): ImmichImportCandidate["reason"] | null => {
  const left = normalizeName(immichName);
  const right = normalizeName(personName);
  if (!left || !right) {
    return null;
  }
  if (left === right) {
    return "exactName";
  }
  if (left.includes(right) || right.includes(left)) {
    return "partialName";
  }
  return null;
};

const reasonScore = (reason: ImmichImportCandidate["reason"]) => {
  switch (reason) {
    case "externalIdentity":
      return 1;
    case "exactName":
      return 0.9;
    case "partialName":
      return 0.6;
  }
};

export const registerImmichProviderRoutes = (app: FastifyInstance) => {
  app.get("/providers/immich/people/preview", async (request) => {
    const auth = getRequiredAuth(request);
    const immichClient = await getImmichClientForRequest(request);
    const [immichPeople, treemichPeople] = await Promise.all([
      immichClient.listPeople(),
      app.services.personService.list(auth.user.id)
    ]);
    const providerPersonIds = immichPeople.map((person) => person.id);
    const identities = await prisma.personExternalIdentity.findMany({
      where: {
        userId: auth.user.id,
        provider: "IMMICH",
        providerPersonId: { in: providerPersonIds }
      },
      include: { person: true }
    });
    const linkedByImmichId = new Map(identities.map((identity) => [identity.providerPersonId, identity]));

    const people: ImmichImportPreviewRow[] = immichPeople.map((immichPerson) => {
      const linked = linkedByImmichId.get(immichPerson.id);
      const candidates: ImmichImportCandidate[] = [];
      if (linked) {
        candidates.push({
          personId: linked.personId,
          name:
            (linked.person.displayNameOverride ??
              [linked.person.givenName, linked.person.surname].filter(Boolean).join(" ")) ||
            `Person ${linked.personId.slice(0, 8)}`,
          score: reasonScore("externalIdentity"),
          reason: "externalIdentity"
        });
      }
      for (const person of treemichPeople) {
        if (linked?.personId === person.id) {
          continue;
        }
        const reason = candidateScore(immichPerson.name, person.name);
        if (!reason) {
          continue;
        }
        candidates.push({
          personId: person.id,
          name: person.name,
          score: reasonScore(reason),
          reason
        });
      }

      candidates.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
      return {
        providerPersonId: immichPerson.id,
        name: immichPerson.name,
        birthDate: immichPerson.birthDate ?? null,
        thumbnailPath: immichPerson.thumbnailPath ?? null,
        linkedPersonId: linked?.personId ?? null,
        linkedPersonName: candidates[0]?.reason === "externalIdentity" ? candidates[0].name : null,
        candidates: candidates.slice(0, 5)
      };
    });

    const linkedPeople = people.filter((person) => person.linkedPersonId).length;
    return {
      linked: true,
      people,
      totals: {
        immichPeople: people.length,
        linkedPeople,
        unlinkedPeople: people.length - linkedPeople
      }
    };
  });

  app.post("/providers/immich/people/import", async (request) => {
    const auth = getRequiredAuth(request);
    const body = immichPeopleImportBodySchema.parse(request.body);
    const immichClient = await getImmichClientForRequest(request);
    const immichPeople = new Map((await immichClient.listPeople()).map((person) => [person.id, person]));
    const results = [];
    let thumbnailsImported = 0;

    for (const decision of body.decisions) {
      const immichPerson = immichPeople.get(decision.providerPersonId);
      if (decision.action === "skip") {
        results.push({
          providerPersonId: decision.providerPersonId,
          action: decision.action,
          status: "skipped"
        });
        continue;
      }
      if (!immichPerson) {
        results.push({
          providerPersonId: decision.providerPersonId,
          action: decision.action,
          status: "error",
          message: "Immich person not found"
        });
        continue;
      }

      try {
        const person =
          decision.action === "create"
            ? await app.services.personService.create(auth.user.id, {
                ...splitName(immichPerson.name),
                givenName: decision.givenName ?? splitName(immichPerson.name).givenName,
                surname: decision.surname ?? splitName(immichPerson.name).surname,
                gender: (decision.gender ?? "UNKNOWN") as GenderValue
              })
            : await app.services.personService.get(auth.user.id, decision.personId);
        const existingIdentity = await prisma.personExternalIdentity.findFirst({
          where: {
            userId: auth.user.id,
            provider: "IMMICH",
            providerPersonId: decision.providerPersonId
          }
        });
        if (existingIdentity && existingIdentity.personId !== person.id) {
          results.push({
            providerPersonId: decision.providerPersonId,
            action: decision.action,
            personId: existingIdentity.personId,
            status: "error",
            message: "Immich person is already linked to another Treemich person"
          });
          continue;
        }

        const linkedAccount =
          request.auth && "linkedAccount" in request.auth
            ? (request.auth as { linkedAccount: { immichBaseUrl: string } }).linkedAccount
            : null;
        const identity =
          existingIdentity ??
          (await prisma.personExternalIdentity.create({
            data: {
              userId: auth.user.id,
              personId: person.id,
              provider: "IMMICH",
              providerPersonId: decision.providerPersonId,
              providerBaseUrl: linkedAccount?.immichBaseUrl ?? null,
              displayName: immichPerson.name,
              lastSeenAt: new Date(),
              metadata: { importedFromImmichProvider: true }
            }
          }));
        if (existingIdentity) {
          await prisma.personExternalIdentity.update({
            where: { id: existingIdentity.id },
            data: { displayName: immichPerson.name, lastSeenAt: new Date() }
          });
        }
        if (body.importThumbnails) {
          await importImmichThumbnailForIdentity({
            userId: auth.user.id,
            personId: person.id,
            identity,
            immichClient
          });
          thumbnailsImported += 1;
        }
        results.push({
          providerPersonId: decision.providerPersonId,
          action: decision.action,
          personId: person.id,
          status: existingIdentity ? "alreadyLinked" : decision.action === "create" ? "created" : "linked"
        });
      } catch (error) {
        results.push({
          providerPersonId: decision.providerPersonId,
          action: decision.action,
          status: "error",
          message: error instanceof Error ? error.message : "Import failed"
        });
      }
    }

    return {
      results,
      summary: {
        created: results.filter((result) => result.status === "created").length,
        linked: results.filter((result) => result.status === "linked").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        alreadyLinked: results.filter((result) => result.status === "alreadyLinked").length,
        errors: results.filter((result) => result.status === "error").length,
        thumbnailsImported
      }
    };
  });

  app.post("/providers/immich/thumbnails/import", async (request) => {
    const auth = getRequiredAuth(request);
    const body = immichThumbnailImportBodySchema.parse(request.body);
    const immichClient = await getImmichClientForRequest(request);
    const identities = await prisma.personExternalIdentity.findMany({
      where: {
        userId: auth.user.id,
        provider: "IMMICH",
        ...(body.personIds ? { personId: { in: body.personIds } } : {})
      }
    });
    const results = [];
    for (const identity of identities) {
      try {
        const thumbnail = await importImmichThumbnailForIdentity({
          userId: auth.user.id,
          personId: identity.personId,
          identity,
          immichClient
        });
        results.push({
          personId: identity.personId,
          providerPersonId: identity.providerPersonId,
          status: "imported",
          thumbnail
        });
      } catch (error) {
        results.push({
          personId: identity.personId,
          providerPersonId: identity.providerPersonId,
          status: "error",
          message: error instanceof Error ? error.message : "Thumbnail import failed"
        });
      }
    }
    return {
      results,
      summary: {
        imported: results.filter((result) => result.status === "imported").length,
        skipped: 0,
        errors: results.filter((result) => result.status === "error").length
      }
    };
  });

  app.post("/providers/immich/cooccurrence/import", async (request, reply) => {
    const auth = getRequiredAuth(request);
    const job = await app.services.cooccurrenceService.triggerComputation(
      auth.user.id,
      await getImmichClientForRequest(request)
    );
    return reply.code(202).send({ jobId: job.id, status: job.status });
  });
};
