import { prisma } from "../db/client.js";
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

export async function computeTreeValidationForUser(userId: string): Promise<LifeEventValidationFinding[]> {
  const findings: LifeEventValidationFinding[] = [];

  const [profiles, relationships] = await Promise.all([
    prisma.personProfile.findMany({
      where: { userId },
      select: { id: true, immichPersonId: true }
    }),
    prisma.relationship.findMany({
      where: { userId }
    })
  ]);

  const [personEvents, relationshipEvents] = await Promise.all([
    prisma.lifeEvent.findMany({
      where: {
        userId,
        personProfileId: { in: profiles.map((profile) => profile.id) }
      },
      select: {
        personProfileId: true,
        eventType: true,
        year: true,
        month: true,
        day: true
      },
      orderBy: [{ year: "asc" }, { month: "asc" }, { day: "asc" }, { id: "asc" }]
    }),
    prisma.lifeEvent.findMany({
      where: {
        userId,
        relationshipId: { in: relationships.map((relationship) => relationship.id) }
      },
      select: {
        relationshipId: true,
        eventType: true,
        year: true,
        month: true,
        day: true
      },
      orderBy: [{ year: "asc" }, { id: "asc" }]
    })
  ]);

  const eventsByProfileId = new Map<string, typeof personEvents>();
  for (const event of personEvents) {
    if (!event.personProfileId) {
      continue;
    }
    const events = eventsByProfileId.get(event.personProfileId) ?? [];
    events.push(event);
    eventsByProfileId.set(event.personProfileId, events);
  }

  const eventsByRelationshipId = new Map<string, typeof relationshipEvents>();
  for (const event of relationshipEvents) {
    if (!event.relationshipId) {
      continue;
    }
    const events = eventsByRelationshipId.get(event.relationshipId) ?? [];
    events.push(event);
    eventsByRelationshipId.set(event.relationshipId, events);
  }

  const profileIdByImmichId = new Map(profiles.map((profile) => [profile.immichPersonId, profile.id]));

  for (const p of profiles) {
    const events = eventsByProfileId.get(p.id) ?? [];
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

  for (const r of relationships) {
    const relEvents = eventsByRelationshipId.get(r.id) ?? [];
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
    const parentEvents = eventsByProfileId.get(profileIdByImmichId.get(parentImmich) ?? "") ?? [];
    const childEvents = eventsByProfileId.get(profileIdByImmichId.get(childImmich) ?? "") ?? [];
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
