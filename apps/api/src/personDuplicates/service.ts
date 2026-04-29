import type { PersonDuplicateCandidateStatus, Prisma } from "@prisma/client";
import type {
  PersonDuplicateCandidateRecord,
  PersonDuplicateListQuery,
  PersonDuplicateReason,
  PersonDuplicateRecomputeResponse,
  PersonDuplicateSummary,
  PersonMergeResult
} from "@treemich/shared";
import { formatPersonNameDisplay } from "@treemich/shared";
import { prisma } from "../db/client.js";

type CandidateRow = Prisma.PersonDuplicateCandidateGetPayload<{
  include: {
    personA: {
      include: {
        externalIdentities: true;
        lifeEvents: true;
      };
    };
    personB: {
      include: {
        externalIdentities: true;
        lifeEvents: true;
      };
    };
  };
}>;

type DetectionPerson = Prisma.PersonProfileGetPayload<{
  include: {
    personNames: true;
    externalIdentities: true;
    lifeEvents: true;
  };
}>;

const candidateInclude = {
  personA: {
    include: {
      externalIdentities: true,
      lifeEvents: { where: { eventType: { in: ["BIRTH", "DEATH"] } } }
    }
  },
  personB: {
    include: {
      externalIdentities: true,
      lifeEvents: { where: { eventType: { in: ["BIRTH", "DEATH"] } } }
    }
  }
} as const satisfies Prisma.PersonDuplicateCandidateInclude;

const httpError = (statusCode: number, message: string) => {
  const err = new Error(message);
  (err as Error & { statusCode: number }).statusCode = statusCode;
  return err;
};

const toIsoOrNull = (value?: Date | null) => value?.toISOString() ?? null;

const normalizeText = (value: string | null | undefined) =>
  value
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase() ?? "";

const dateValue = (event: { year: number | null; month: number | null; day: number | null }) => {
  if (event.year == null) {
    return null;
  }
  const month = event.month == null ? "" : `-${String(event.month).padStart(2, "0")}`;
  const day = event.day == null ? "" : `-${String(event.day).padStart(2, "0")}`;
  return `${String(event.year).padStart(4, "0")}${month}${day}`;
};

const vital = (person: {
  lifeEvents: Array<{ eventType: string; year: number | null; month: number | null; day: number | null }>;
}) => ({
  birth: dateValue(
    person.lifeEvents.find((event) => event.eventType === "BIRTH") ?? { year: null, month: null, day: null }
  ),
  death: dateValue(
    person.lifeEvents.find((event) => event.eventType === "DEATH") ?? { year: null, month: null, day: null }
  )
});

const displayName = (person: {
  id: string;
  displayNameOverride: string | null;
  givenName: string | null;
  surname: string | null;
}) =>
  person.displayNameOverride?.trim() ||
  formatPersonNameDisplay({
    givenName: person.givenName,
    surname: person.surname
  }) ||
  `Person ${person.id.slice(0, 8)}`;

const personSummary = (person: CandidateRow["personA"]): PersonDuplicateSummary => {
  const dates = vital(person);
  return {
    id: person.id,
    label: displayName(person),
    givenName: person.givenName,
    surname: person.surname,
    birthDate: dates.birth,
    deathDate: dates.death,
    externalIdentityCount: person.externalIdentities.length
  };
};

const parseReasons = (value: unknown): PersonDuplicateReason[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is PersonDuplicateReason => {
          if (!item || typeof item !== "object") {
            return false;
          }
          const candidate = item as Partial<PersonDuplicateReason>;
          return typeof candidate.code === "string" && typeof candidate.label === "string";
        })
        .map((item) => ({
          code: item.code,
          label: item.label,
          detail: item.detail,
          weight: typeof item.weight === "number" ? item.weight : 0
        }))
    : [];

const toRecord = (row: CandidateRow): PersonDuplicateCandidateRecord => ({
  id: row.id,
  personAId: row.personAId,
  personBId: row.personBId,
  score: row.score,
  reasons: parseReasons(row.reasons),
  status: row.status,
  dismissedAt: toIsoOrNull(row.dismissedAt),
  mergedAt: toIsoOrNull(row.mergedAt),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  personA: personSummary(row.personA),
  personB: personSummary(row.personB)
});

const orderedPair = (left: string, right: string) =>
  left < right ? ([left, right] as const) : ([right, left] as const);

const increment = (counts: Record<string, number>, key: string, amount: number) => {
  counts[key] = (counts[key] ?? 0) + amount;
};

export class PersonDuplicateService {
  async list(
    userId: string,
    query: PersonDuplicateListQuery = {}
  ): Promise<PersonDuplicateCandidateRecord[]> {
    const rows = await prisma.personDuplicateCandidate.findMany({
      where: {
        userId,
        ...(query.status ? { status: query.status as PersonDuplicateCandidateStatus } : {})
      },
      include: candidateInclude,
      orderBy: [{ status: "asc" }, { score: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
      take: query.limit ?? 50,
      skip: query.offset ?? 0
    });
    return rows.map(toRecord);
  }

  async recomputeCandidates(userId: string): Promise<PersonDuplicateRecomputeResponse> {
    const people = await prisma.personProfile.findMany({
      where: { userId },
      include: {
        personNames: true,
        externalIdentities: true,
        lifeEvents: { where: { eventType: { in: ["BIRTH", "DEATH"] } } }
      },
      orderBy: [{ surname: "asc" }, { givenName: "asc" }, { id: "asc" }]
    });
    const [relationships, families, cooccurrenceEdges] = await Promise.all([
      prisma.relationship.findMany({
        where: { userId },
        select: { fromPersonId: true, toPersonId: true, type: true }
      }),
      prisma.family.findMany({
        where: { userId },
        include: { children: true }
      }),
      prisma.cooccurrenceEdge.findMany({
        where: { userId, score: { gte: 0.7 } },
        select: { personAId: true, personBId: true, sharedPhotos: true, score: true }
      })
    ]);

    const candidates = this.detectCandidates(people, relationships, families, cooccurrenceEdges);
    const now = new Date();
    const summary = { created: 0, updated: 0, preservedDismissed: 0, pending: 0 };

    for (const candidate of candidates) {
      const [personAId, personBId] = orderedPair(candidate.personAId, candidate.personBId);
      const existing = await prisma.personDuplicateCandidate.findUnique({
        where: { userId_personAId_personBId: { userId, personAId, personBId } }
      });
      if (existing?.status === "DISMISSED" || existing?.status === "MERGED") {
        summary.preservedDismissed += existing.status === "DISMISSED" ? 1 : 0;
        continue;
      }
      if (existing) {
        await prisma.personDuplicateCandidate.update({
          where: { id: existing.id },
          data: {
            score: candidate.score,
            reasons: candidate.reasons as Prisma.InputJsonValue,
            status: "PENDING",
            dismissedAt: null
          }
        });
        summary.updated += 1;
      } else {
        await prisma.personDuplicateCandidate.create({
          data: {
            userId,
            personAId,
            personBId,
            score: candidate.score,
            reasons: candidate.reasons as Prisma.InputJsonValue,
            createdAt: now
          }
        });
        summary.created += 1;
      }
    }

    summary.pending = await prisma.personDuplicateCandidate.count({ where: { userId, status: "PENDING" } });
    return {
      candidates: await this.list(userId, { status: "PENDING", limit: 50 }),
      summary
    };
  }

  async updateStatus(
    userId: string,
    candidateId: string,
    status: "PENDING" | "DISMISSED"
  ): Promise<PersonDuplicateCandidateRecord> {
    const existing = await prisma.personDuplicateCandidate.findFirst({ where: { id: candidateId, userId } });
    if (!existing) {
      throw httpError(404, "Duplicate candidate not found");
    }
    const now = new Date();
    await prisma.personDuplicateCandidate.update({
      where: { id: candidateId },
      data: {
        status,
        dismissedAt: status === "DISMISSED" ? now : null
      }
    });
    return this.get(userId, candidateId);
  }

  async mergePeople(
    userId: string,
    candidateId: string,
    canonicalPersonId: string,
    duplicatePersonId: string
  ): Promise<PersonMergeResult> {
    if (canonicalPersonId === duplicatePersonId) {
      throw httpError(400, "Cannot merge a person into itself");
    }

    const counts: Record<string, number> = {};
    const warnings: string[] = [];
    let auditId = "";

    await prisma.$transaction(async (tx) => {
      const candidate = await tx.personDuplicateCandidate.findFirst({ where: { id: candidateId, userId } });
      if (!candidate) {
        throw httpError(404, "Duplicate candidate not found");
      }
      if (candidate.status !== "PENDING") {
        throw httpError(409, "Duplicate candidate is not pending");
      }
      const pair = new Set([candidate.personAId, candidate.personBId]);
      if (!pair.has(canonicalPersonId) || !pair.has(duplicatePersonId)) {
        throw httpError(400, "Merge people must match the duplicate candidate pair");
      }

      const [canonical, duplicate] = await Promise.all([
        tx.personProfile.findFirst({ where: { id: canonicalPersonId, userId } }),
        tx.personProfile.findFirst({ where: { id: duplicatePersonId, userId } })
      ]);
      if (!canonical || !duplicate) {
        throw httpError(404, "Person not found");
      }

      const mergedExternalIds = {
        ...this.jsonObject(duplicate.externalIds),
        ...this.jsonObject(canonical.externalIds)
      };
      await tx.personProfile.update({
        where: { id: canonicalPersonId },
        data: { externalIds: mergedExternalIds as Prisma.InputJsonValue }
      });

      await this.moveExternalIdentities(tx, userId, duplicatePersonId, canonicalPersonId, counts);
      await this.movePersonNames(tx, userId, duplicatePersonId, canonicalPersonId, counts);

      const thumbnails = await tx.personThumbnail.updateMany({
        where: { userId, personId: duplicatePersonId },
        data: { personId: canonicalPersonId }
      });
      increment(counts, "personThumbnails", thumbnails.count);

      const tasks = await tx.researchTask.updateMany({
        where: { userId, personId: duplicatePersonId },
        data: { personId: canonicalPersonId }
      });
      increment(counts, "researchTasks", tasks.count);

      const events = await tx.lifeEvent.updateMany({
        where: { userId, personProfileId: duplicatePersonId },
        data: { personProfileId: canonicalPersonId }
      });
      increment(counts, "lifeEvents", events.count);

      await this.movePersonMediaLinks(tx, userId, duplicatePersonId, canonicalPersonId, counts);
      await this.moveValidationFindings(tx, userId, duplicatePersonId, canonicalPersonId, counts);
      const affectedFamilyIds = await this.mergeFamilies(
        tx,
        userId,
        duplicatePersonId,
        canonicalPersonId,
        counts,
        warnings
      );
      await this.mergeRelationships(
        tx,
        userId,
        duplicatePersonId,
        canonicalPersonId,
        affectedFamilyIds,
        counts
      );
      await this.rebuildFamilyEdges(tx, userId, affectedFamilyIds, counts);
      await this.mergeCooccurrenceEdges(tx, userId, duplicatePersonId, canonicalPersonId, counts);

      await tx.personDuplicateCandidate.updateMany({
        where: {
          userId,
          OR: [
            { personAId: duplicatePersonId, personBId: canonicalPersonId },
            { personAId: canonicalPersonId, personBId: duplicatePersonId }
          ]
        },
        data: { status: "MERGED", mergedAt: new Date() }
      });
      const audit = await tx.personMergeAudit.create({
        data: {
          userId,
          candidateId,
          canonicalPersonId,
          duplicatePersonId,
          changedCounts: counts as Prisma.InputJsonValue,
          warnings: warnings as Prisma.InputJsonValue,
          externalIdentityPolicy:
            "Moved distinct external identities to canonical person; duplicate provider tuples were deduped.",
          metadata: { canonicalKeptProfileFields: true } as Prisma.InputJsonValue
        }
      });
      auditId = audit.id;

      await tx.personProfile.delete({ where: { id: duplicatePersonId } });
      increment(counts, "personProfilesDeleted", 1);
    });

    const candidate = await this.get(userId, candidateId);
    return {
      candidate,
      auditId,
      canonicalPersonId,
      duplicatePersonId,
      changedCounts: counts,
      warnings
    };
  }

  private async get(userId: string, candidateId: string): Promise<PersonDuplicateCandidateRecord> {
    const row = await prisma.personDuplicateCandidate.findFirst({
      where: { id: candidateId, userId },
      include: candidateInclude
    });
    if (!row) {
      throw httpError(404, "Duplicate candidate not found");
    }
    return toRecord(row);
  }

  private detectCandidates(
    people: DetectionPerson[],
    relationships: Array<{ fromPersonId: string; toPersonId: string; type: string }>,
    families: Array<{
      parent1PersonId: string | null;
      parent2PersonId: string | null;
      children: Array<{ childPersonId: string | null }>;
    }>,
    cooccurrenceEdges: Array<{ personAId: string; personBId: string; sharedPhotos: number; score: number }>
  ) {
    const familySignals = this.familySignalMap(relationships, families);
    const cooccurrence = new Map(
      cooccurrenceEdges.map((edge) => [`${edge.personAId}:${edge.personBId}`, edge])
    );
    const candidates = new Map<
      string,
      { personAId: string; personBId: string; score: number; reasons: PersonDuplicateReason[] }
    >();

    for (let leftIndex = 0; leftIndex < people.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < people.length; rightIndex += 1) {
        const left = people[leftIndex]!;
        const right = people[rightIndex]!;
        const reasons = this.scorePair(left, right, familySignals, cooccurrence);
        const score = reasons.reduce((sum, reason) => sum + reason.weight, 0);
        const hasStrongReason = reasons.some(
          (reason) => reason.code !== "cooccurrence" && reason.weight >= 25
        );
        if (score < 50 || !hasStrongReason) {
          continue;
        }
        const [personAId, personBId] = orderedPair(left.id, right.id);
        candidates.set(`${personAId}:${personBId}`, {
          personAId,
          personBId,
          score: Math.min(100, Math.round(score)),
          reasons
        });
      }
    }

    return [...candidates.values()].sort((left, right) => right.score - left.score);
  }

  private scorePair(
    left: DetectionPerson,
    right: DetectionPerson,
    familySignals: Map<string, Set<string>>,
    cooccurrence: Map<string, { sharedPhotos: number; score: number }>
  ): PersonDuplicateReason[] {
    const reasons: PersonDuplicateReason[] = [];
    const leftNames = this.nameTokens(left);
    const rightNames = this.nameTokens(right);
    const sharedNames = [...leftNames.full].filter((name) => rightNames.full.has(name));
    if (sharedNames.length > 0) {
      reasons.push({ code: "name", label: "Same full name", detail: sharedNames[0], weight: 45 });
    } else if (
      leftNames.surnames.size > 0 &&
      [...leftNames.surnames].some((name) => rightNames.surnames.has(name))
    ) {
      const leftInitial = [...leftNames.given][0]?.slice(0, 1);
      const rightInitial = [...rightNames.given][0]?.slice(0, 1);
      reasons.push({
        code: "name",
        label: "Shared surname",
        detail: leftInitial && leftInitial === rightInitial ? "Given-name initials also match" : undefined,
        weight: leftInitial && leftInitial === rightInitial ? 35 : 22
      });
    }

    const leftVital = vital(left);
    const rightVital = vital(right);
    if (leftVital.birth && rightVital.birth && leftVital.birth === rightVital.birth) {
      reasons.push({ code: "vital", label: "Same birth date", detail: leftVital.birth, weight: 35 });
    } else if (
      leftVital.birth?.slice(0, 4) &&
      leftVital.birth.slice(0, 4) === rightVital.birth?.slice(0, 4)
    ) {
      reasons.push({
        code: "vital",
        label: "Same birth year",
        detail: leftVital.birth.slice(0, 4),
        weight: 20
      });
    }
    if (leftVital.death && rightVital.death && leftVital.death === rightVital.death) {
      reasons.push({ code: "vital", label: "Same death date", detail: leftVital.death, weight: 20 });
    }

    const sharedFamilySignals = [...(familySignals.get(left.id) ?? [])].filter((signal) =>
      familySignals.get(right.id)?.has(signal)
    );
    if (sharedFamilySignals.length > 0) {
      reasons.push({
        code: "family",
        label: "Close family overlap",
        detail: sharedFamilySignals.slice(0, 3).join(", "),
        weight: 30
      });
    }

    const [personAId, personBId] = orderedPair(left.id, right.id);
    const edge = cooccurrence.get(`${personAId}:${personBId}`);
    if (edge) {
      reasons.push({
        code: "cooccurrence",
        label: "Strong photo co-occurrence",
        detail: `${edge.sharedPhotos} shared photos`,
        weight: 10
      });
    }

    if (left.externalIdentities.length > 0 && right.externalIdentities.length > 0) {
      reasons.push({
        code: "externalIdentity",
        label: "Both people have external identities",
        detail: "Merge preserves distinct identities and dedupes identical provider tuples",
        weight: 0
      });
    }

    return reasons;
  }

  private nameTokens(person: DetectionPerson) {
    const full = new Set<string>();
    const surnames = new Set<string>();
    const given = new Set<string>();
    const add = (first: string | null | undefined, last: string | null | undefined) => {
      const normalizedFirst = normalizeText(first);
      const normalizedLast = normalizeText(last);
      if (normalizedFirst) {
        given.add(normalizedFirst);
      }
      if (normalizedLast) {
        surnames.add(normalizedLast);
      }
      const joined = [normalizedFirst, normalizedLast].filter(Boolean).join(" ");
      if (joined) {
        full.add(joined);
      }
    };
    add(person.givenName, person.surname);
    for (const name of person.personNames) {
      add(name.givenName, name.surname);
    }
    for (const nickname of normalizeText(person.nicknames)
      .split(/\s*,\s*/)
      .filter(Boolean)) {
      given.add(nickname);
    }
    return { full, surnames, given };
  }

  private familySignalMap(
    relationships: Array<{ fromPersonId: string; toPersonId: string; type: string }>,
    families: Array<{
      parent1PersonId: string | null;
      parent2PersonId: string | null;
      children: Array<{ childPersonId: string | null }>;
    }>
  ) {
    const signals = new Map<string, Set<string>>();
    const add = (personId: string | null | undefined, signal: string) => {
      if (!personId) {
        return;
      }
      const set = signals.get(personId) ?? new Set<string>();
      set.add(signal);
      signals.set(personId, set);
    };
    for (const rel of relationships) {
      if (rel.type === "SPOUSE_OF") {
        add(rel.fromPersonId, `spouse:${rel.toPersonId}`);
      }
      if (rel.type === "PARENT_OF") {
        add(rel.toPersonId, `parent:${rel.fromPersonId}`);
        add(rel.fromPersonId, `child:${rel.toPersonId}`);
      }
    }
    for (const family of families) {
      const parentKey = [family.parent1PersonId, family.parent2PersonId].filter(Boolean).sort().join("+");
      for (const child of family.children) {
        add(child.childPersonId, `parents:${parentKey}`);
      }
    }
    return signals;
  }

  private jsonObject(value: unknown): Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async moveExternalIdentities(
    tx: Prisma.TransactionClient,
    userId: string,
    duplicatePersonId: string,
    canonicalPersonId: string,
    counts: Record<string, number>
  ) {
    const rows = await tx.personExternalIdentity.findMany({ where: { userId, personId: duplicatePersonId } });
    for (const row of rows) {
      const existing = await tx.personExternalIdentity.findFirst({
        where: {
          userId,
          personId: canonicalPersonId,
          provider: row.provider,
          providerBaseUrl: row.providerBaseUrl,
          providerPersonId: row.providerPersonId
        }
      });
      if (existing) {
        await tx.personExternalIdentity.delete({ where: { id: row.id } });
        increment(counts, "externalIdentityDuplicatesDeleted", 1);
        continue;
      }
      await tx.personExternalIdentity.update({
        where: { id: row.id },
        data: { personId: canonicalPersonId }
      });
      increment(counts, "externalIdentitiesMoved", 1);
    }
  }

  private async movePersonNames(
    tx: Prisma.TransactionClient,
    userId: string,
    duplicatePersonId: string,
    canonicalPersonId: string,
    counts: Record<string, number>
  ) {
    const canonicalPrimary = await tx.personName.findFirst({
      where: { userId, personProfileId: canonicalPersonId, isPrimary: true }
    });
    const moved = await tx.personName.updateMany({
      where: { userId, personProfileId: duplicatePersonId },
      data: {
        personProfileId: canonicalPersonId,
        ...(canonicalPrimary ? { isPrimary: false } : {})
      }
    });
    increment(counts, "personNames", moved.count);
  }

  private async movePersonMediaLinks(
    tx: Prisma.TransactionClient,
    userId: string,
    duplicatePersonId: string,
    canonicalPersonId: string,
    counts: Record<string, number>
  ) {
    const links = await tx.mediaLink.findMany({
      where: { userId, targetType: "PERSON_PROFILE", targetId: duplicatePersonId }
    });
    for (const link of links) {
      const existing = await tx.mediaLink.findFirst({
        where: {
          userId,
          mediaObjectId: link.mediaObjectId,
          targetType: "PERSON_PROFILE",
          targetId: canonicalPersonId
        }
      });
      if (existing) {
        await tx.mediaLink.delete({ where: { id: link.id } });
        increment(counts, "mediaLinkDuplicatesDeleted", 1);
        continue;
      }
      await tx.mediaLink.update({ where: { id: link.id }, data: { targetId: canonicalPersonId } });
      increment(counts, "mediaLinks", 1);
    }
  }

  private async moveValidationFindings(
    tx: Prisma.TransactionClient,
    userId: string,
    duplicatePersonId: string,
    canonicalPersonId: string,
    counts: Record<string, number>
  ) {
    const primary = await tx.validationFinding.updateMany({
      where: { userId, personId: duplicatePersonId },
      data: { personId: canonicalPersonId }
    });
    const related = await tx.validationFinding.updateMany({
      where: { userId, relatedPersonId: duplicatePersonId },
      data: { relatedPersonId: canonicalPersonId }
    });
    increment(counts, "validationFindings", primary.count + related.count);
  }

  private async mergeFamilies(
    tx: Prisma.TransactionClient,
    userId: string,
    duplicatePersonId: string,
    canonicalPersonId: string,
    counts: Record<string, number>,
    warnings: string[]
  ) {
    const families = await tx.family.findMany({
      where: {
        userId,
        OR: [
          { parent1PersonId: duplicatePersonId },
          { parent2PersonId: duplicatePersonId },
          { children: { some: { childPersonId: duplicatePersonId } } }
        ]
      },
      include: { children: true }
    });
    const affectedFamilyIds = new Set(families.map((family) => family.id));

    for (const family of families) {
      const parent1PersonId =
        family.parent1PersonId === duplicatePersonId ? canonicalPersonId : family.parent1PersonId;
      let parent2PersonId =
        family.parent2PersonId === duplicatePersonId ? canonicalPersonId : family.parent2PersonId;
      if (parent1PersonId && parent1PersonId === parent2PersonId) {
        parent2PersonId = null;
        warnings.push(`Family ${family.id} had duplicate person in both parent slots; parent2 was cleared.`);
      }
      await tx.family.update({
        where: { id: family.id },
        data: { parent1PersonId, parent2PersonId }
      });
      increment(counts, "families", 1);

      for (const child of family.children.filter((item) => item.childPersonId === duplicatePersonId)) {
        const existing = await tx.familyChild.findFirst({
          where: { familyId: family.id, childPersonId: canonicalPersonId }
        });
        if (existing) {
          await tx.familyChild.delete({ where: { id: child.id } });
          increment(counts, "familyChildDuplicatesDeleted", 1);
        } else {
          await tx.familyChild.update({
            where: { id: child.id },
            data: { childPersonId: canonicalPersonId }
          });
          increment(counts, "familyChildren", 1);
        }
      }
    }

    return affectedFamilyIds;
  }

  private async mergeRelationships(
    tx: Prisma.TransactionClient,
    userId: string,
    duplicatePersonId: string,
    canonicalPersonId: string,
    affectedFamilyIds: Set<string>,
    counts: Record<string, number>
  ) {
    if (affectedFamilyIds.size > 0) {
      const deleted = await tx.relationship.deleteMany({
        where: { userId, familyId: { in: [...affectedFamilyIds] } }
      });
      increment(counts, "familyDerivedRelationshipsDeleted", deleted.count);
    }

    const rows = await tx.relationship.findMany({
      where: {
        userId,
        familyId: null,
        OR: [{ fromPersonId: duplicatePersonId }, { toPersonId: duplicatePersonId }]
      }
    });
    for (const row of rows) {
      const fromPersonId = row.fromPersonId === duplicatePersonId ? canonicalPersonId : row.fromPersonId;
      const toPersonId = row.toPersonId === duplicatePersonId ? canonicalPersonId : row.toPersonId;
      if (fromPersonId === toPersonId) {
        await tx.relationship.delete({ where: { id: row.id } });
        increment(counts, "relationshipSelfLoopsDeleted", 1);
        continue;
      }
      const existing = await tx.relationship.findFirst({
        where: { userId, fromPersonId, toPersonId, type: row.type, NOT: { id: row.id } }
      });
      if (existing) {
        await tx.relationship.delete({ where: { id: row.id } });
        increment(counts, "relationshipDuplicatesDeleted", 1);
        continue;
      }
      await tx.relationship.update({ where: { id: row.id }, data: { fromPersonId, toPersonId } });
      increment(counts, "relationships", 1);
    }
  }

  private async rebuildFamilyEdges(
    tx: Prisma.TransactionClient,
    userId: string,
    affectedFamilyIds: Set<string>,
    counts: Record<string, number>
  ) {
    if (affectedFamilyIds.size === 0) {
      return;
    }
    const families = await tx.family.findMany({
      where: { userId, id: { in: [...affectedFamilyIds] } },
      include: { children: true }
    });
    const rows: Prisma.RelationshipCreateManyInput[] = [];
    for (const family of families) {
      const parents = [family.parent1PersonId, family.parent2PersonId].filter(
        (id): id is string => typeof id === "string" && id.length > 0
      );
      if (parents.length === 2) {
        const [left, right] =
          parents[0]! < parents[1]! ? [parents[0]!, parents[1]!] : [parents[1]!, parents[0]!];
        rows.push(
          { userId, fromPersonId: left, toPersonId: right, type: "SPOUSE_OF" },
          { userId, fromPersonId: right, toPersonId: left, type: "SPOUSE_OF" }
        );
      }
      for (const child of family.children) {
        if (!child.childPersonId) {
          continue;
        }
        for (const parentId of parents) {
          rows.push(
            {
              userId,
              fromPersonId: parentId,
              toPersonId: child.childPersonId,
              type: "PARENT_OF",
              familyId: family.id
            },
            {
              userId,
              fromPersonId: child.childPersonId,
              toPersonId: parentId,
              type: "CHILD_OF",
              familyId: family.id
            }
          );
        }
      }
    }
    if (rows.length > 0) {
      await tx.relationship.createMany({ data: rows, skipDuplicates: true });
      increment(counts, "familyDerivedRelationshipsCreated", rows.length);
    }
  }

  private async mergeCooccurrenceEdges(
    tx: Prisma.TransactionClient,
    userId: string,
    duplicatePersonId: string,
    canonicalPersonId: string,
    counts: Record<string, number>
  ) {
    const rows = await tx.cooccurrenceEdge.findMany({
      where: { userId, OR: [{ personAId: duplicatePersonId }, { personBId: duplicatePersonId }] }
    });
    for (const row of rows) {
      const mappedA = row.personAId === duplicatePersonId ? canonicalPersonId : row.personAId;
      const mappedB = row.personBId === duplicatePersonId ? canonicalPersonId : row.personBId;
      if (mappedA === mappedB) {
        await tx.cooccurrenceEdge.delete({ where: { id: row.id } });
        increment(counts, "cooccurrenceSelfLoopsDeleted", 1);
        continue;
      }
      const [personAId, personBId] = orderedPair(mappedA, mappedB);
      const existing = await tx.cooccurrenceEdge.findFirst({
        where: { userId, personAId, personBId, NOT: { id: row.id } }
      });
      if (existing) {
        await tx.cooccurrenceEdge.update({
          where: { id: existing.id },
          data: {
            sharedPhotos: Math.max(existing.sharedPhotos, row.sharedPhotos),
            score: Math.max(existing.score, row.score),
            personAPhotoCount: Math.max(existing.personAPhotoCount, row.personAPhotoCount),
            personBPhotoCount: Math.max(existing.personBPhotoCount, row.personBPhotoCount)
          }
        });
        await tx.cooccurrenceEdge.delete({ where: { id: row.id } });
        increment(counts, "cooccurrenceDuplicatesDeleted", 1);
        continue;
      }
      await tx.cooccurrenceEdge.update({ where: { id: row.id }, data: { personAId, personBId } });
      increment(counts, "cooccurrenceEdges", 1);
    }
  }
}
