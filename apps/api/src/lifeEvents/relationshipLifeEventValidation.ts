import { compareLifeEventDates } from "./dateValue.js";
import type { LifeEventValidationFinding } from "./personLifeEventValidation.js";

type EventDateParts = {
  eventType: string;
  year: number | null;
  month: number | null;
  day: number | null;
};

export function computeMarriageAfterDivorceFindings(
  events: EventDateParts[],
  context: { relationshipId: string }
): LifeEventValidationFinding[] {
  const marriage = events.find((e) => e.eventType === "MARRIAGE");
  const divorce = events.find((e) => e.eventType === "DIVORCE");
  if (!marriage || !divorce) {
    return [];
  }
  if (marriage.year == null || divorce.year == null) {
    return [];
  }
  const ma = { year: marriage.year, month: marriage.month, day: marriage.day };
  const dv = { year: divorce.year, month: divorce.month, day: divorce.day };
  if (compareLifeEventDates(ma, dv) > 0) {
    return [
      {
        code: "marriage_after_divorce",
        severity: "error" as const,
        message: "MARRIAGE is dated after DIVORCE for this relationship.",
        relationshipId: context.relationshipId
      }
    ];
  }
  return [];
}

type PartialYmd = { year: number | null; month: number | null; day: number | null } | null;

export function computeParentBornAfterChildFindings(
  parentBirth: PartialYmd,
  childBirth: PartialYmd,
  context: { parentImmichPersonId: string; childImmichPersonId: string; relationshipId: string }
): LifeEventValidationFinding[] {
  if (!parentBirth || !childBirth) {
    return [];
  }
  if (parentBirth.year == null || childBirth.year == null) {
    return [];
  }
  const p = { year: parentBirth.year, month: parentBirth.month, day: parentBirth.day };
  const c = { year: childBirth.year, month: childBirth.month, day: childBirth.day };
  if (compareLifeEventDates(p, c) > 0) {
    return [
      {
        code: "parent_birth_after_child",
        severity: "error" as const,
        message: "A parent is dated as born after a child in this link.",
        immichPersonId: context.parentImmichPersonId,
        relatedImmichPersonId: context.childImmichPersonId,
        relationshipId: context.relationshipId
      }
    ];
  }
  return [];
}
