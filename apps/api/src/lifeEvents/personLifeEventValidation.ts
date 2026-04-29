import { compareLifeEventDates } from "./dateValue.js";

export type LifeEventValidationFinding = {
  code: string;
  severity: "error" | "warning";
  message: string;
  /** Treemich PersonProfile.id this finding applies to (life-event scope). */
  personId?: string;
  relationshipId?: string;
  relatedPersonId?: string;
};

type EventDateParts = {
  eventType: string;
  year: number | null;
  month: number | null;
  day: number | null;
};

/**
 * Read-only checks on a person's life events (Phase 1 validation slice).
 * Conservative: only emits findings when enough partial-date fields exist to compare.
 */
export function computePersonLifeEventFindings(
  events: EventDateParts[],
  context?: { personId: string }
): LifeEventValidationFinding[] {
  const findings: LifeEventValidationFinding[] = [];
  const birth = events.find((e) => e.eventType === "BIRTH");
  const death = events.find((e) => e.eventType === "DEATH");
  if (!birth || !death) {
    return findings;
  }
  if (birth.year == null || death.year == null) {
    return findings;
  }
  const bp = { year: birth.year, month: birth.month, day: birth.day };
  const dp = { year: death.year, month: death.month, day: death.day };
  if (compareLifeEventDates(bp, dp) > 0) {
    findings.push({
      code: "birth_after_death",
      severity: "error",
      message: "BIRTH is dated after DEATH for this person.",
      personId: context?.personId
    });
  }
  return findings;
}
