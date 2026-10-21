/**
 * @file Optional Immich provider import routes.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import {
  immichPeopleImportBodySchema,
  immichThumbnailImportBodySchema,
  type GenderValue,
  type ImmichBirthdayPersonRow,
  type ImmichBirthdayResult,
  type ImmichBirthdayTotals,
  type ImmichImportCandidate,
  type ImmichImportPreviewRow,
  type ImmichPeopleSyncDuplicateRecompute,
  type ImmichPersonResult
} from "@treemich/shared";
import { prisma } from "../db/client.js";
import { importImmichThumbnailForIdentity } from "../integrations/immich/importProvider.js";
import { getRequiredAuth } from "../auth/request.js";
import { TreemichAuthError } from "../auth/service.js";
import {
  emptyImmichBirthdayTotals,
  formatImmichBirthDate,
  normalizeImmichBirthDate
} from "../integrations/immich/birthDate.js";
import {
  ImmichAuthenticationError,
  ImmichUpstreamError,
  type ImmichClient
} from "../integrations/immich/client.js";
import { decideCanonicalBirth, selectCanonicalBirth } from "../lifeEvents/canonicalBirth.js";
import type { ApplyImmichPersonMode } from "../people/immichBirthdayImport.js";
import { getImmichClientForRequest } from "../services.js";

const runDuplicateRecomputeIfNeeded = async (
  app: FastifyInstance,
  userId: string,
  createdCount: number
): Promise<ImmichPeopleSyncDuplicateRecompute> => {
  if (createdCount <= 0) {
    return { status: "skipped" };
  }
  const duplicateService = app.services.personDuplicateService;
  if (!duplicateService) {
    return { status: "skipped" };
  }
  try {
    const response = await duplicateService.recomputeCandidates(userId);
    return { status: "ok", summary: response.summary };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Duplicate recompute failed"
    };
  }
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

const LINK_OR_REFRESH_MESSAGE = "Link or refresh your Immich account.";

const providerBaseUrlFor = (request: FastifyRequest): string | null => {
  if (!request.auth || !("linkedAccount" in request.auth)) {
    return null;
  }
  const linked = (request.auth as { linkedAccount?: { immichBaseUrl?: string } }).linkedAccount;
  return linked?.immichBaseUrl ?? null;
};

const sendImmichProviderError = (reply: FastifyReply, error: unknown): FastifyReply | null => {
  if (error instanceof ZodError) {
    const field =
      error.issues
        .map((issue) => issue.path.join("."))
        .filter(Boolean)
        .join(", ") || "body";
    return reply.code(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: `Invalid field: ${field}`
    });
  }
  if (error instanceof TreemichAuthError || error instanceof ImmichAuthenticationError) {
    return reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: LINK_OR_REFRESH_MESSAGE
    });
  }
  if (error instanceof ImmichUpstreamError) {
    return reply.code(502).send({
      statusCode: 502,
      error: "Bad Gateway",
      message: `Listing Immich people failed with status ${error.immichStatus}`
    });
  }
  return null;
};

const countBirthdays = (
  rows: Array<{ birthdayResult?: ImmichBirthdayResult | undefined }>
): ImmichBirthdayTotals => {
  const totals = emptyImmichBirthdayTotals();
  for (const row of rows) {
    if (row.birthdayResult) {
      totals[row.birthdayResult] += 1;
    }
  }
  return totals;
};

const logImmichBirthday = (
  request: FastifyRequest,
  action: "preview" | "import" | "sync",
  userId: string,
  totals: Record<string, number>,
  rows: Array<{ providerPersonId: string; personResult?: ImmichPersonResult; birthdayResult?: string }>
) => {
  const totalText = Object.entries(totals)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  request.log.info(
    `[immich-birthday] action=${action} userId=${userId} requestId=${request.id} ${totalText}`
  );
  for (const row of rows) {
    request.log.debug(
      `[immich-birthday] requestId=${request.id} providerPersonId=${row.providerPersonId} personResult=${row.personResult ?? ""} birthdayResult=${row.birthdayResult ?? ""}`
    );
  }
};

const listImmichPeople = async (immichClient: ImmichClient) => {
  try {
    return await immichClient.listPeople();
  } catch (error) {
    if (error instanceof ImmichAuthenticationError || error instanceof ImmichUpstreamError) {
      throw error;
    }
    throw new ImmichUpstreamError("listPeople", 502);
  }
};

const toPublicResult = (row: {
  providerPersonId: string;
  personResult: ImmichPersonResult;
  personId?: string;
  birthdayResult?: ImmichBirthdayPersonRow["birthdayResult"];
  birthDate: string | null;
  rawBirthDate?: string;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  message?: string;
}): ImmichBirthdayPersonRow => ({
  providerPersonId: row.providerPersonId,
  personResult: row.personResult,
  ...(row.personId ? { personId: row.personId } : {}),
  ...(row.birthdayResult ? { birthdayResult: row.birthdayResult } : {}),
  birthDate: row.birthDate,
  ...(row.birthdayResult === "malformed" && row.rawBirthDate ? { rawBirthDate: row.rawBirthDate } : {}),
  birthYear: row.birthYear,
  birthMonth: row.birthMonth,
  birthDay: row.birthDay,
  ...(row.message ? { message: row.message } : {})
});

export const registerImmichProviderRoutes = (app: FastifyInstance) => {
  app.post("/providers/immich/people/sync", async (request, reply) => {
    let immichClient: ImmichClient | null = null;
    try {
      const auth = getRequiredAuth(request);
      immichClient = await getImmichClientForRequest(request);
      const immichPeople = await listImmichPeople(immichClient);
      const summary = await app.services.personService.syncImmichLabelledPeople(auth.user.id, immichPeople, {
        providerBaseUrl: providerBaseUrlFor(request)
      });
      const duplicateRecompute = await runDuplicateRecomputeIfNeeded(app, auth.user.id, summary.created);
      logImmichBirthday(
        request,
        "sync",
        auth.user.id,
        {
          created: summary.created,
          updated: summary.updated,
          alreadyLinked: summary.alreadyLinked,
          skippedUnnamed: summary.skippedUnnamed,
          errors: summary.results.filter((row) => row.personResult === "error").length,
          ...summary.birthdays
        },
        summary.results
      );
      return { ...summary, duplicateRecompute };
    } catch (error) {
      const sent = sendImmichProviderError(reply, error);
      if (sent) {
        return sent;
      }
      throw error;
    } finally {
      immichClient?.dispose();
    }
  });

  app.get("/providers/immich/people/preview", async (request, reply) => {
    let immichClient: ImmichClient | null = null;
    try {
      const auth = getRequiredAuth(request);
      immichClient = await getImmichClientForRequest(request);
      const [immichPeople, treemichPeople] = await Promise.all([
        listImmichPeople(immichClient),
        app.services.personService.list(auth.user.id)
      ]);
      const providerPersonIds = immichPeople.map((person) => person.id);
      const identities =
        providerPersonIds.length === 0
          ? []
          : await prisma.personExternalIdentity.findMany({
              where: {
                userId: auth.user.id,
                provider: "IMMICH",
                providerPersonId: { in: providerPersonIds }
              },
              include: { person: true }
            });
      const linkedByImmichId = new Map(identities.map((identity) => [identity.providerPersonId, identity]));
      const linkedPersonIds = [...new Set(identities.map((identity) => identity.personId))];
      const birthRows =
        linkedPersonIds.length === 0
          ? []
          : await prisma.lifeEvent.findMany({
              where: {
                userId: auth.user.id,
                personProfileId: { in: linkedPersonIds },
                eventType: "BIRTH"
              }
            });
      const birthsByPerson = new Map<string, typeof birthRows>();
      for (const row of birthRows) {
        if (!row.personProfileId) {
          continue;
        }
        const list = birthsByPerson.get(row.personProfileId) ?? [];
        list.push(row);
        birthsByPerson.set(row.personProfileId, list);
      }

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
        const named = immichPerson.name.trim().length > 0;
        const canonical = linked ? selectCanonicalBirth(birthsByPerson.get(linked.personId) ?? []) : null;
        const normalized = normalizeImmichBirthDate(immichPerson.birthDate);
        const prediction = named
          ? decideCanonicalBirth(normalized, named && linked ? canonical : null)
          : null;
        const linkedCandidate = candidates[0]?.reason === "externalIdentity" ? candidates[0] : null;
        return {
          providerPersonId: immichPerson.id,
          name: immichPerson.name,
          birthDate:
            normalized.kind === "full"
              ? formatImmichBirthDate(normalized.year, normalized.month, normalized.day)
              : null,
          ...(prediction?.birthdayResult === "malformed" && normalized.kind === "malformed"
            ? { rawBirthDate: normalized.raw }
            : {}),
          birthYear: canonical?.year ?? null,
          birthMonth: canonical?.month ?? null,
          birthDay: canonical?.day ?? null,
          ...(named ? {} : { personResult: "skipped" as const }),
          ...(named && linked ? { personResult: "alreadyLinked" as const } : {}),
          ...(prediction ? { birthdayResult: prediction.birthdayResult } : {}),
          thumbnailPath: immichPerson.thumbnailPath ?? null,
          linkedPersonId: linked?.personId ?? null,
          linkedPersonName: linkedCandidate ? linkedCandidate.name : null,
          candidates: candidates.slice(0, 5)
        };
      });

      const linkedPeople = people.filter((person) => person.linkedPersonId).length;
      const birthdays = countBirthdays(people);
      logImmichBirthday(
        request,
        "preview",
        auth.user.id,
        {
          immichPeople: people.length,
          linkedPeople,
          unlinkedPeople: people.length - linkedPeople,
          ...birthdays
        },
        people
      );
      return {
        linked: true,
        people,
        totals: {
          immichPeople: people.length,
          linkedPeople,
          unlinkedPeople: people.length - linkedPeople,
          birthdays
        }
      };
    } catch (error) {
      const sent = sendImmichProviderError(reply, error);
      if (sent) {
        return sent;
      }
      throw error;
    } finally {
      immichClient?.dispose();
    }
  });

  app.post("/providers/immich/people/import", async (request, reply) => {
    let immichClient: ImmichClient | null = null;
    try {
      const auth = getRequiredAuth(request);
      const body = immichPeopleImportBodySchema.parse(request.body);
      immichClient = await getImmichClientForRequest(request);
      const immichPeople = new Map(
        (await listImmichPeople(immichClient)).map((person) => [person.id, person])
      );
      const providerBaseUrl = providerBaseUrlFor(request);
      const results = [];
      let thumbnailsImported = 0;

      for (const decision of body.decisions) {
        const immichPerson = immichPeople.get(decision.providerPersonId) ?? null;
        const mode: ApplyImmichPersonMode =
          decision.action === "skip"
            ? { type: "skip" }
            : decision.action === "create"
              ? {
                  type: "create",
                  givenName: decision.givenName ?? null,
                  surname: decision.surname ?? null,
                  gender: (decision.gender ?? "UNKNOWN") as GenderValue
                }
              : { type: "link", personId: decision.personId };
        const applied = await app.services.personService.applyImmichPerson(auth.user.id, {
          providerBaseUrl,
          providerPersonId: decision.providerPersonId,
          immichPerson,
          identities: "query",
          mode
        });
        if (
          body.importThumbnails &&
          immichClient &&
          applied.identityId &&
          applied.personId &&
          applied.personResult !== "error" &&
          applied.personResult !== "skipped"
        ) {
          try {
            await importImmichThumbnailForIdentity({
              userId: auth.user.id,
              personId: applied.personId,
              identity: { id: applied.identityId, providerPersonId: decision.providerPersonId },
              immichClient
            });
            thumbnailsImported += 1;
          } catch {
            request.log.debug(
              `[immich-birthday] requestId=${request.id} providerPersonId=${decision.providerPersonId} thumbnail=error`
            );
          }
        }
        const row = toPublicResult(applied);
        results.push({
          ...row,
          action: decision.action,
          status: applied.personResult
        });
      }

      const birthdays = countBirthdays(results);
      const summary = {
        created: results.filter((result) => result.personResult === "created").length,
        linked: results.filter((result) => result.personResult === "linked").length,
        skipped: results.filter((result) => result.personResult === "skipped").length,
        alreadyLinked: results.filter((result) => result.personResult === "alreadyLinked").length,
        errors: results.filter((result) => result.personResult === "error").length,
        thumbnailsImported,
        birthdays
      };
      logImmichBirthday(
        request,
        "import",
        auth.user.id,
        {
          created: summary.created,
          linked: summary.linked,
          skipped: summary.skipped,
          alreadyLinked: summary.alreadyLinked,
          errors: summary.errors,
          ...birthdays
        },
        results
      );
      const duplicateRecompute = await runDuplicateRecomputeIfNeeded(app, auth.user.id, summary.created);
      return { results, summary: { ...summary, duplicateRecompute } };
    } catch (error) {
      const sent = sendImmichProviderError(reply, error);
      if (sent) {
        return sent;
      }
      throw error;
    } finally {
      immichClient?.dispose();
    }
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
