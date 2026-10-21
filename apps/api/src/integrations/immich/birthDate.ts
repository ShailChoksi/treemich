/**
 * Immich `birthDate` becomes one of three results: a full date, an absent provider birthday,
 * or a malformed provider birthday. Birthday is the only field that uses this checklist.
 */

import type { ImmichBirthdayTotals } from "@treemich/shared";
import { parseIsoDateToParts } from "../../lifeEvents/dateValue.js";

const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
/** v1.125.0–v1.129.x people responses. The calendar day is the first ten characters. */
const utcMidnightTimestampPattern = /^(\d{4}-\d{2}-\d{2})T00:00:00\.000Z$/;

export type NormalizedImmichBirthDate =
  | { kind: "full"; year: number; month: number; day: number }
  | { kind: "absent" }
  | { kind: "malformed"; raw: string };

export const emptyImmichBirthdayTotals = (): ImmichBirthdayTotals => ({
  filled: 0,
  equal: 0,
  conflict: 0,
  malformed: 0,
  absent: 0
});

export const formatImmichBirthDate = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * Accepts a real calendar `YYYY-MM-DD` in years 1–9999, and only the UTC midnight timestamp
 * `YYYY-MM-DDT00:00:00.000Z`. Missing, JSON null, and `""` are absent. Every other string is malformed.
 */
export const normalizeImmichBirthDate = (value: string | null | undefined): NormalizedImmichBirthDate => {
  if (value == null || value === "") {
    return { kind: "absent" };
  }
  if (typeof value !== "string") {
    return { kind: "malformed", raw: String(value) };
  }

  const timestampDay = utcMidnightTimestampPattern.exec(value)?.[1];
  const calendarDay = timestampDay ?? (calendarDatePattern.test(value) ? value : null);
  if (!calendarDay) {
    return { kind: "malformed", raw: value };
  }

  const parts = parseIsoDateToParts(calendarDay);
  if (parts?.year == null || parts.month == null || parts.day == null) {
    return { kind: "malformed", raw: value };
  }
  return { kind: "full", year: parts.year, month: parts.month, day: parts.day };
};

export const normalizedImmichBirthDateIso = (normalized: NormalizedImmichBirthDate): string | null =>
  normalized.kind === "full"
    ? formatImmichBirthDate(normalized.year, normalized.month, normalized.day)
    : null;
