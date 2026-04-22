import { prisma } from "../db/client.js";
import { LifeEventService } from "../lifeEvents/service.js";
import {
  computePersonLifeEventFindings,
  type LifeEventValidationFinding
} from "../lifeEvents/personLifeEventValidation.js";
import {
  computeMarriageAfterDivorceFindings,
  computeParentBornAfterChildFindings
} from "../lifeEvents/relationshipLifeEventValidation.js";

export const mergeTreeFindings = (...batches: LifeEventValidationFinding[][]): LifeEventValidationFinding[] =>
  batches.flat();

export async function computeTreeValidationForUser(
  userId: string,
  lifeEventService: LifeEventService
): Promise<LifeEventValidationFinding[]> {
  const findings: LifeEventValidationFinding[] = [];

  const profiles = await prisma.personProfile.findMany({
    where: { userId },
    select: { id: true, immichPersonId: true }
  });

  for (const p of profiles) {
    const events = await lifeEventService.listPersonLifeEvents(userId, p.immichPersonId, {
      includeCitations: false
    });
    findings.push(
      ...computePersonLifeEventFindings(
        events.map((e) => ({
          eventType: e.eventType,
          year: e.year,
          month: e.month,
          day: e.day
        })),
        { immichPersonId: p.immichPersonId }
      )
    );
  }

  const relationships = await prisma.relationship.findMany({
    where: { userId }
  });

  for (const r of relationships) {
    const relEvents = await lifeEventService.listRelationshipLifeEvents(userId, r.id, {
      includeCitations: false
    });
    const dateParts = relEvents.map((e) => ({
      eventType: e.eventType,
      year: e.year,
      month: e.month,
      day: e.day
    }));
    findings.push(...computeMarriageAfterDivorceFindings(dateParts, { relationshipId: r.id }));
  }

  for (const r of relationships) {
    if (r.type !== "PARENT_OF" && r.type !== "CHILD_OF") {
      continue;
    }
    const parentImmich = r.type === "PARENT_OF" ? r.fromPersonId : r.toPersonId;
    const childImmich = r.type === "PARENT_OF" ? r.toPersonId : r.fromPersonId;
    const parentEvents = await lifeEventService.listPersonLifeEvents(userId, parentImmich, {
      includeCitations: false
    });
    const childEvents = await lifeEventService.listPersonLifeEvents(userId, childImmich, {
      includeCitations: false
    });
    const pBirth = parentEvents.find((e) => e.eventType === "BIRTH");
    const cBirth = childEvents.find((e) => e.eventType === "BIRTH");
    if (!pBirth || !cBirth) {
      continue;
    }
    findings.push(
      ...computeParentBornAfterChildFindings(
        { year: pBirth.year, month: pBirth.month, day: pBirth.day },
        { year: cBirth.year, month: cBirth.month, day: cBirth.day },
        {
          parentImmichPersonId: parentImmich,
          childImmichPersonId: childImmich,
          relationshipId: r.id
        }
      )
    );
  }

  return dedupeFindings(findings);
}

const findingKey = (f: LifeEventValidationFinding) =>
  [f.code, f.immichPersonId ?? "", f.relationshipId ?? "", f.relatedImmichPersonId ?? "", f.message].join(
    "|"
  );

function dedupeFindings(list: LifeEventValidationFinding[]): LifeEventValidationFinding[] {
  const seen = new Set<string>();
  const out: LifeEventValidationFinding[] = [];
  for (const f of list) {
    const k = findingKey(f);
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(f);
  }
  return out;
}
