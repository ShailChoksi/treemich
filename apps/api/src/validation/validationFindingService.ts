import type {
  ValidationFindingListQuery,
  ValidationFindingRecord,
  ValidationFindingStatus,
  ValidationRecomputeSummary
} from "@treemich/shared";
import { formatPersonNameDisplay } from "@treemich/shared";
import { prisma } from "../db/client.js";
import type { LifeEventValidationFinding } from "../lifeEvents/personLifeEventValidation.js";

type PersistableFinding = LifeEventValidationFinding & { familyId?: string };

const statusToPrisma = (status: ValidationFindingStatus) => status;
const severityToPrisma = (severity: PersistableFinding["severity"]) =>
  severity === "error" ? "ERROR" : "WARNING";
const severityFromPrisma = (severity: "ERROR" | "WARNING") => (severity === "ERROR" ? "error" : "warning");

export const fingerprintFinding = (finding: PersistableFinding): string =>
  [
    finding.code,
    finding.personId ?? "",
    finding.relationshipId ?? "",
    finding.relatedPersonId ?? "",
    finding.familyId ?? ""
  ].join("|");

const personLabel = (
  person?: { displayNameOverride: string | null; givenName: string | null; surname: string | null } | null
) => (person ? formatPersonNameDisplay(person) : null);

const notFound = (message: string) => {
  const err = new Error(message);
  (err as Error & { statusCode: number }).statusCode = 404;
  return err;
};

type ValidationFindingRow = Awaited<ReturnType<typeof prisma.validationFinding.findMany>>[number];

type EnrichedValidationFindingRow = ValidationFindingRow & {
  person?: {
    id: string;
    displayNameOverride: string | null;
    givenName: string | null;
    surname: string | null;
  } | null;
  relatedPerson?: {
    id: string;
    displayNameOverride: string | null;
    givenName: string | null;
    surname: string | null;
  } | null;
  relationship?: {
    id: string;
    type: string;
    fromPersonId: string;
    toPersonId: string;
    fromPerson: { displayNameOverride: string | null; givenName: string | null; surname: string | null };
    toPerson: { displayNameOverride: string | null; givenName: string | null; surname: string | null };
  } | null;
  family?: {
    id: string;
    parent1: { displayNameOverride: string | null; givenName: string | null; surname: string | null } | null;
    parent2: { displayNameOverride: string | null; givenName: string | null; surname: string | null } | null;
  } | null;
};

const familyLabel = (family: EnrichedValidationFindingRow["family"]) => {
  if (!family) {
    return null;
  }
  const parent1 = personLabel(family.parent1) ?? "Unknown parent";
  const parent2 = personLabel(family.parent2) ?? "Unknown parent";
  return `${parent1} + ${parent2}`;
};

const relationshipLabel = (relationship: EnrichedValidationFindingRow["relationship"]) => {
  if (!relationship) {
    return null;
  }
  const from = personLabel(relationship.fromPerson) ?? relationship.fromPersonId;
  const to = personLabel(relationship.toPerson) ?? relationship.toPersonId;
  return `${from} ${relationship.type} ${to}`;
};

const toRecord = (row: EnrichedValidationFindingRow): ValidationFindingRecord => ({
  id: row.id,
  code: row.code,
  severity: severityFromPrisma(row.severity),
  message: row.message,
  personId: row.personId,
  relationshipId: row.relationshipId,
  relatedPersonId: row.relatedPersonId,
  familyId: row.familyId,
  status: row.status,
  fingerprint: row.fingerprint,
  firstSeenAt: row.firstSeenAt.toISOString(),
  lastSeenAt: row.lastSeenAt.toISOString(),
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
  dismissedAt: row.dismissedAt?.toISOString() ?? null,
  inProgressAt: row.inProgressAt?.toISOString() ?? null,
  metadata:
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {},
  display: {
    person: row.person ? { id: row.person.id, label: personLabel(row.person) ?? row.person.id } : null,
    relatedPerson: row.relatedPerson
      ? { id: row.relatedPerson.id, label: personLabel(row.relatedPerson) ?? row.relatedPerson.id }
      : null,
    relationship: row.relationship
      ? {
          id: row.relationship.id,
          label: relationshipLabel(row.relationship) ?? row.relationship.id,
          fromPersonId: row.relationship.fromPersonId,
          toPersonId: row.relationship.toPersonId
        }
      : null,
    family: row.family ? { id: row.family.id, label: familyLabel(row.family) ?? row.family.id } : null
  }
});

export class ValidationFindingService {
  async persistTreeValidationFindings(
    userId: string,
    findings: PersistableFinding[]
  ): Promise<{ findings: ValidationFindingRecord[]; summary: ValidationRecomputeSummary }> {
    const now = new Date();
    const fingerprints = new Set(findings.map(fingerprintFinding));
    const summary: ValidationRecomputeSummary = {
      current: findings.length,
      created: 0,
      reopened: 0,
      resolved: 0,
      inProgressStillPresent: 0,
      dismissedStillPresent: 0
    };

    await prisma.$transaction(async (tx) => {
      for (const finding of findings) {
        const fingerprint = fingerprintFinding(finding);
        const existing = await tx.validationFinding.findUnique({
          where: { userId_fingerprint: { userId, fingerprint } }
        });
        if (!existing) {
          summary.created += 1;
          await tx.validationFinding.create({
            data: {
              userId,
              code: finding.code,
              severity: severityToPrisma(finding.severity),
              message: finding.message,
              personId: finding.personId ?? null,
              relationshipId: finding.relationshipId ?? null,
              relatedPersonId: finding.relatedPersonId ?? null,
              familyId: finding.familyId ?? null,
              fingerprint,
              lastSeenAt: now
            }
          });
          continue;
        }

        const nextStatus = existing.status === "RESOLVED" ? "OPEN" : existing.status;
        if (existing.status === "RESOLVED") {
          summary.reopened += 1;
        } else if (existing.status === "DISMISSED") {
          summary.dismissedStillPresent += 1;
        } else if (existing.status === "IN_PROGRESS") {
          summary.inProgressStillPresent += 1;
        }

        await tx.validationFinding.update({
          where: { id: existing.id },
          data: {
            code: finding.code,
            severity: severityToPrisma(finding.severity),
            message: finding.message,
            personId: finding.personId ?? null,
            relationshipId: finding.relationshipId ?? null,
            relatedPersonId: finding.relatedPersonId ?? null,
            familyId: finding.familyId ?? null,
            status: nextStatus,
            lastSeenAt: now,
            ...(nextStatus === "OPEN" ? { resolvedAt: null } : {})
          }
        });
      }

      const stale = await tx.validationFinding.updateMany({
        where: {
          userId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
          fingerprint: { notIn: [...fingerprints] }
        },
        data: {
          status: "RESOLVED",
          resolvedAt: now
        }
      });
      summary.resolved = stale.count;
    });

    return {
      findings: await this.list(userId, { status: ["OPEN", "IN_PROGRESS"] }),
      summary
    };
  }

  async list(userId: string, query: ValidationFindingListQuery = {}): Promise<ValidationFindingRecord[]> {
    const status = Array.isArray(query.status) ? query.status : query.status ? [query.status] : undefined;
    const rows = await prisma.validationFinding.findMany({
      where: {
        userId,
        ...(status?.length ? { status: { in: status.map(statusToPrisma) } } : {}),
        ...(query.severity ? { severity: severityToPrisma(query.severity) } : {}),
        ...(query.code ? { code: query.code } : {}),
        ...(query.personId ? { personId: query.personId } : {}),
        ...(query.familyId ? { familyId: query.familyId } : {})
      },
      include: {
        person: true,
        relatedPerson: true,
        relationship: { include: { fromPerson: true, toPerson: true } },
        family: { include: { parent1: true, parent2: true } }
      },
      orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }, { id: "asc" }],
      take: query.limit ?? 100,
      skip: query.offset ?? 0
    });
    return rows.map(toRecord);
  }

  async updateStatus(
    userId: string,
    findingId: string,
    status: "OPEN" | "IN_PROGRESS" | "DISMISSED"
  ): Promise<ValidationFindingRecord> {
    const existing = await prisma.validationFinding.findFirst({ where: { id: findingId, userId } });
    if (!existing) {
      throw notFound("Validation finding not found");
    }
    const now = new Date();
    await prisma.validationFinding.update({
      where: { id: findingId },
      data: {
        status,
        ...(status === "OPEN" ? { dismissedAt: null, inProgressAt: null, resolvedAt: null } : {}),
        ...(status === "IN_PROGRESS" ? { inProgressAt: now, dismissedAt: null, resolvedAt: null } : {}),
        ...(status === "DISMISSED" ? { dismissedAt: now, inProgressAt: null } : {})
      }
    });
    const row = await prisma.validationFinding.findFirst({
      where: { id: findingId, userId },
      include: {
        person: true,
        relatedPerson: true,
        relationship: { include: { fromPerson: true, toPerson: true } },
        family: { include: { parent1: true, parent2: true } }
      }
    });
    if (!row) {
      throw notFound("Validation finding not found");
    }
    return toRecord(row);
  }
}
