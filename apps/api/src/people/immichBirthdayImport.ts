/**
 * One database transaction per Immich person. The profile (when this run creates one), the provider
 * identity (when this run creates it), and the canonical-birth create or fill commit together.
 * A conflict, an absent provider birthday, and a malformed provider birthday still commit the link.
 */

import type { Gender, PersonExternalIdentity, Prisma } from "@prisma/client";
import type { GenderValue, ImmichBirthdayPersonRow, ImmichProviderPerson } from "@treemich/shared";
import { splitImmichPersonDisplayName } from "@treemich/shared";
import { prisma } from "../db/client.js";
import {
  emptyImmichBirthdayTotals,
  normalizeImmichBirthDate,
  normalizedImmichBirthDateIso,
  type NormalizedImmichBirthDate
} from "../integrations/immich/birthDate.js";
import { applyCanonicalBirth, type CanonicalBirthOutcome } from "../lifeEvents/canonicalBirth.js";

export const IMMICH_PERSON_NOT_FOUND = "Immich person not found";
export const IMMICH_PERSON_LINKED_ELSEWHERE = "Immich person is already linked to another Treemich person";
export const BIRTHDAY_IMPORT_FAILED = "Birthday import failed";

export type ApplyImmichPersonMode =
  | { type: "sync" }
  | { type: "skip" }
  | { type: "create"; givenName: string | null; surname: string | null; gender: GenderValue }
  | { type: "link"; personId: string };

export type ApplyImmichPersonInput = {
  providerBaseUrl: string | null;
  providerPersonId: string;
  immichPerson: ImmichProviderPerson | null;
  /** Pass an array from a batch read. `"query"` loads and locks inside this transaction. */
  identities: PersonExternalIdentity[] | "query";
  mode: ApplyImmichPersonMode;
};

export type ImmichPersonApplyOutcome = ImmichBirthdayPersonRow & {
  metadataUpdated: boolean;
  identityId?: string;
};

const emptyParts = { birthYear: null, birthMonth: null, birthDay: null };

export const normalizeImmichBaseUrl = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const hasName = (person: ImmichProviderPerson | null): boolean =>
  String(person?.name ?? "").trim().length > 0;

export const pickMatchingImmichIdentity = (
  rows: PersonExternalIdentity[],
  normalizedCurrentBaseUrl: string | null
): PersonExternalIdentity | null => {
  const candidates = rows.filter((row) =>
    normalizedCurrentBaseUrl == null
      ? row.providerBaseUrl == null
      : row.providerBaseUrl === normalizedCurrentBaseUrl || row.providerBaseUrl == null
  );
  if (candidates.length === 0) {
    return null;
  }
  return candidates.find((row) => row.providerBaseUrl === normalizedCurrentBaseUrl) ?? candidates[0] ?? null;
};

const identityWhere = (
  userId: string,
  providerPersonId: string,
  normalizedCurrent: string | null
): Prisma.PersonExternalIdentityWhereInput =>
  normalizedCurrent == null
    ? { userId, provider: "IMMICH", providerPersonId, providerBaseUrl: null }
    : {
        userId,
        provider: "IMMICH",
        providerPersonId,
        OR: [{ providerBaseUrl: normalizedCurrent }, { providerBaseUrl: null }]
      };

const lockIdentity = async (tx: Prisma.TransactionClient, identityId: string): Promise<void> => {
  await tx.$queryRaw`SELECT "id" FROM "PersonExternalIdentity" WHERE "id" = ${identityId} FOR UPDATE`;
};

const dateFields = (
  normalized: NormalizedImmichBirthDate,
  parts: Pick<CanonicalBirthOutcome, "birthYear" | "birthMonth" | "birthDay">
) => ({
  birthDate: normalizedImmichBirthDateIso(normalized),
  ...parts,
  ...(normalized.kind === "malformed" ? { rawBirthDate: normalized.raw } : {})
});

const outcome = (
  providerPersonId: string,
  personResult: ImmichPersonApplyOutcome["personResult"],
  fields: Partial<ImmichPersonApplyOutcome> = {}
): ImmichPersonApplyOutcome => ({
  providerPersonId,
  personResult,
  birthDate: null,
  ...emptyParts,
  metadataUpdated: false,
  ...fields
});

const publicRow = (row: ImmichPersonApplyOutcome): ImmichBirthdayPersonRow => {
  const { metadataUpdated, identityId, ...rest } = row;
  void metadataUpdated;
  void identityId;
  return rest;
};

const skippedOutcome = (
  providerPersonId: string,
  normalized: NormalizedImmichBirthDate
): ImmichPersonApplyOutcome =>
  outcome(providerPersonId, "skipped", {
    birthDate: normalizedImmichBirthDateIso(normalized)
  });

const errorOutcome = (
  providerPersonId: string,
  message: string,
  personId?: string
): ImmichPersonApplyOutcome =>
  outcome(providerPersonId, "error", {
    message,
    ...(personId ? { personId } : {})
  });

const namesForCreate = (input: ApplyImmichPersonInput, trimmedName: string) => {
  if (input.mode.type === "create") {
    const split = splitImmichPersonDisplayName(trimmedName);
    return {
      givenName: input.mode.givenName ?? split.givenName,
      surname: input.mode.surname ?? split.surname,
      gender: input.mode.gender as Gender
    };
  }
  const split = splitImmichPersonDisplayName(trimmedName);
  return { givenName: split.givenName, surname: split.surname, gender: "UNKNOWN" as Gender };
};

const applyInsideTransaction = async (
  userId: string,
  input: ApplyImmichPersonInput,
  normalizedBaseUrl: string | null,
  normalized: NormalizedImmichBirthDate
): Promise<ImmichPersonApplyOutcome> => {
  const immichPerson = input.immichPerson;
  if (!immichPerson) {
    return errorOutcome(input.providerPersonId, IMMICH_PERSON_NOT_FOUND);
  }
  const trimmedName = String(immichPerson.name).trim();

  return prisma.$transaction(async (tx) => {
    const rows =
      input.identities === "query"
        ? await tx.personExternalIdentity.findMany({
            where: identityWhere(userId, input.providerPersonId, normalizedBaseUrl)
          })
        : input.identities;
    const existing = pickMatchingImmichIdentity(rows, normalizedBaseUrl);
    if (existing) {
      await lockIdentity(tx, existing.id);
    }

    if (input.mode.type === "link" && existing && existing.personId !== input.mode.personId) {
      return errorOutcome(input.providerPersonId, IMMICH_PERSON_LINKED_ELSEWHERE, existing.personId);
    }

    if (existing) {
      const needsBaseMigration = existing.providerBaseUrl == null && normalizedBaseUrl != null;
      const needsNameUpdate = existing.displayName?.trim() !== trimmedName;
      if (needsBaseMigration || needsNameUpdate) {
        await tx.personExternalIdentity.update({
          where: { id: existing.id },
          data: {
            displayName: trimmedName,
            lastSeenAt: new Date(),
            ...(needsBaseMigration ? { providerBaseUrl: normalizedBaseUrl } : {})
          }
        });
      }
      const birthday = await applyCanonicalBirth(tx, userId, existing.personId, normalized);
      return outcome(input.providerPersonId, "alreadyLinked", {
        personId: existing.personId,
        identityId: existing.id,
        metadataUpdated: needsBaseMigration || needsNameUpdate,
        birthdayResult: birthday.birthdayResult,
        ...dateFields(normalized, birthday)
      });
    }

    let personId: string;
    if (input.mode.type === "link") {
      const person = await tx.personProfile.findFirst({
        where: { id: input.mode.personId, userId },
        select: { id: true }
      });
      if (!person) {
        return errorOutcome(input.providerPersonId, BIRTHDAY_IMPORT_FAILED);
      }
      personId = person.id;
    } else {
      const names = namesForCreate(input, trimmedName);
      const profile = await tx.personProfile.create({
        data: {
          userId,
          gender: names.gender,
          givenName: names.givenName,
          surname: names.surname
        }
      });
      personId = profile.id;
    }

    const identity = await tx.personExternalIdentity.create({
      data: {
        userId,
        personId,
        provider: "IMMICH",
        providerPersonId: input.providerPersonId,
        providerBaseUrl: normalizedBaseUrl,
        displayName: trimmedName,
        lastSeenAt: new Date(),
        metadata:
          input.mode.type === "sync"
            ? { importedFromImmichAutoSync: true }
            : { importedFromImmichProvider: true }
      }
    });
    const birthday = await applyCanonicalBirth(tx, userId, personId, normalized);
    return outcome(input.providerPersonId, input.mode.type === "link" ? "linked" : "created", {
      personId,
      identityId: identity.id,
      birthdayResult: birthday.birthdayResult,
      ...dateFields(normalized, birthday)
    });
  });
};

export const applyImmichPersonRecord = async (
  userId: string,
  input: ApplyImmichPersonInput
): Promise<ImmichPersonApplyOutcome> => {
  const normalized = normalizeImmichBirthDate(input.immichPerson?.birthDate);
  if (input.mode.type === "skip" || (input.mode.type === "sync" && !hasName(input.immichPerson))) {
    return skippedOutcome(input.providerPersonId, normalized);
  }
  if (!input.immichPerson) {
    return errorOutcome(input.providerPersonId, IMMICH_PERSON_NOT_FOUND);
  }

  try {
    return await applyInsideTransaction(
      userId,
      input,
      normalizeImmichBaseUrl(input.providerBaseUrl),
      normalized
    );
  } catch {
    return errorOutcome(input.providerPersonId, BIRTHDAY_IMPORT_FAILED);
  }
};

const batchIdentityWhere = (
  userId: string,
  providerPersonIds: string[],
  normalizedCurrent: string | null
): Prisma.PersonExternalIdentityWhereInput =>
  normalizedCurrent == null
    ? {
        userId,
        provider: "IMMICH",
        providerPersonId: { in: providerPersonIds },
        providerBaseUrl: null
      }
    : {
        userId,
        provider: "IMMICH",
        providerPersonId: { in: providerPersonIds },
        OR: [{ providerBaseUrl: normalizedCurrent }, { providerBaseUrl: null }]
      };

export const syncImmichLabelledPeopleRecords = async (
  userId: string,
  people: ImmichProviderPerson[],
  options: { providerBaseUrl: string | null }
) => {
  const normalizedCurrent = normalizeImmichBaseUrl(options.providerBaseUrl);
  const orderedUnique: ImmichProviderPerson[] = [];
  const seen = new Set<string>();
  for (const person of people) {
    if (seen.has(person.id)) {
      continue;
    }
    seen.add(person.id);
    orderedUnique.push(person);
  }

  const named = orderedUnique.filter((person) => hasName(person));
  const skippedUnnamed = orderedUnique.length - named.length;
  const birthdays = emptyImmichBirthdayTotals();
  const results: ImmichBirthdayPersonRow[] = [];
  let created = 0;
  let updated = 0;
  let alreadyLinked = 0;

  const byProviderPersonId = new Map<string, PersonExternalIdentity[]>();
  if (named.length > 0) {
    const existingRows = await prisma.personExternalIdentity.findMany({
      where: batchIdentityWhere(
        userId,
        named.map((person) => person.id),
        normalizedCurrent
      )
    });
    for (const row of existingRows) {
      const list = byProviderPersonId.get(row.providerPersonId) ?? [];
      list.push(row);
      byProviderPersonId.set(row.providerPersonId, list);
    }
  }

  for (const person of orderedUnique) {
    const applied = await applyImmichPersonRecord(userId, {
      providerBaseUrl: normalizedCurrent,
      providerPersonId: person.id,
      immichPerson: person,
      identities: hasName(person) ? (byProviderPersonId.get(person.id) ?? []) : [],
      mode: { type: "sync" }
    });
    if (applied.personResult === "created") {
      created += 1;
    } else if (applied.metadataUpdated) {
      updated += 1;
    } else if (applied.personResult === "alreadyLinked") {
      alreadyLinked += 1;
    }
    if (applied.birthdayResult) {
      birthdays[applied.birthdayResult] += 1;
    }
    results.push(publicRow(applied));
  }

  return { created, updated, alreadyLinked, skippedUnnamed, birthdays, results };
};
