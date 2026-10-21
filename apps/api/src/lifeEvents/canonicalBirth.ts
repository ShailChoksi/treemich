/**
 * The canonical birth is the earliest `BIRTH` life event on a person (`createdAt`, then `id`).
 * A provider full date creates one when none exists, or fills one whose year, month, and day are all empty.
 * It never overwrites a dated canonical birth and never stores provenance.
 */

import type { Prisma } from "@prisma/client";
import type { ImmichBirthdayResult } from "@treemich/shared";
import {
  normalizedImmichBirthDateIso,
  type NormalizedImmichBirthDate
} from "../integrations/immich/birthDate.js";

export type CanonicalBirthDate = {
  year: number | null;
  month: number | null;
  day: number | null;
};

export type CanonicalBirthRow = CanonicalBirthDate & {
  id: string;
  createdAt: Date;
};

export type CanonicalBirthOutcome = {
  birthdayResult: ImmichBirthdayResult;
  birthDate: string | null;
  rawBirthDate?: string;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
};

const isUndated = (date: CanonicalBirthDate): boolean =>
  date.year == null && date.month == null && date.day == null;

const sameFullDate = (
  date: CanonicalBirthDate,
  full: { year: number; month: number; day: number }
): boolean => date.year === full.year && date.month === full.month && date.day === full.day;

export const selectCanonicalBirth = <T extends { id: string; createdAt: Date }>(
  rows: readonly T[]
): T | null => {
  const [earliest] = [...rows].sort((left, right) => {
    const createdDelta = left.createdAt.getTime() - right.createdAt.getTime();
    if (createdDelta !== 0) {
      return createdDelta;
    }
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });
  return earliest ?? null;
};

/** Prediction for a current read. `write` is what a later apply is allowed to persist. */
export const decideCanonicalBirth = (
  normalized: NormalizedImmichBirthDate,
  canonical: CanonicalBirthDate | null
): { birthdayResult: ImmichBirthdayResult; write: "create" | "fill" | "none" } => {
  if (normalized.kind === "malformed") {
    return { birthdayResult: "malformed", write: "none" };
  }
  if (normalized.kind === "absent") {
    return { birthdayResult: "absent", write: "none" };
  }
  if (!canonical) {
    return { birthdayResult: "filled", write: "create" };
  }
  if (isUndated(canonical)) {
    return { birthdayResult: "filled", write: "fill" };
  }
  if (sameFullDate(canonical, normalized)) {
    return { birthdayResult: "equal", write: "none" };
  }
  return { birthdayResult: "conflict", write: "none" };
};

const reportedParts = (
  normalized: NormalizedImmichBirthDate,
  canonical: CanonicalBirthDate | null,
  write: "create" | "fill" | "none"
): Pick<CanonicalBirthOutcome, "birthYear" | "birthMonth" | "birthDay"> => {
  if ((write === "create" || write === "fill") && normalized.kind === "full") {
    return { birthYear: normalized.year, birthMonth: normalized.month, birthDay: normalized.day };
  }
  return {
    birthYear: canonical?.year ?? null,
    birthMonth: canonical?.month ?? null,
    birthDay: canonical?.day ?? null
  };
};

export const canonicalBirthOutcome = (
  normalized: NormalizedImmichBirthDate,
  canonical: CanonicalBirthDate | null,
  decision: { birthdayResult: ImmichBirthdayResult; write: "create" | "fill" | "none" }
): CanonicalBirthOutcome => ({
  birthdayResult: decision.birthdayResult,
  birthDate: normalizedImmichBirthDateIso(normalized),
  ...(normalized.kind === "malformed" ? { rawBirthDate: normalized.raw } : {}),
  ...reportedParts(normalized, canonical, decision.write)
});

/**
 * Read and, when the rules say so, create or fill the canonical birth.
 * Caller holds the person transaction and has already locked the provider identity.
 */
export const applyCanonicalBirth = async (
  tx: Prisma.TransactionClient,
  userId: string,
  personId: string,
  normalized: NormalizedImmichBirthDate
): Promise<CanonicalBirthOutcome> => {
  const rows = await tx.lifeEvent.findMany({
    where: { userId, personProfileId: personId, eventType: "BIRTH" }
  });
  const canonical = selectCanonicalBirth(Array.isArray(rows) ? rows : []);
  const decision = decideCanonicalBirth(normalized, canonical);

  if (decision.write === "create" && normalized.kind === "full") {
    await tx.lifeEvent.create({
      data: {
        userId,
        eventType: "BIRTH",
        customLabel: null,
        dateQualifier: "EXACT",
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        endYear: null,
        endMonth: null,
        endDay: null,
        personProfileId: personId,
        relationshipId: null,
        placeId: null,
        notes: null
      }
    });
  } else if (decision.write === "fill" && normalized.kind === "full" && canonical) {
    await tx.lifeEvent.update({
      where: { id: canonical.id },
      data: {
        year: normalized.year,
        month: normalized.month,
        day: normalized.day
      }
    });
  }

  return canonicalBirthOutcome(normalized, canonical, decision);
};

export const previewCanonicalParts = (canonical: CanonicalBirthDate | null): CanonicalBirthDate => ({
  year: canonical?.year ?? null,
  month: canonical?.month ?? null,
  day: canonical?.day ?? null
});
