import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { applyCanonicalBirth, selectCanonicalBirth } from "./canonicalBirth.js";

const birth = (
  id: string,
  createdAt: string,
  year: number | null,
  month: number | null,
  day: number | null,
  extras: Record<string, unknown> = {}
) => ({
  id,
  createdAt: new Date(createdAt),
  year,
  month,
  day,
  dateQualifier: "EXACT",
  placeId: null,
  notes: null,
  ...extras
});

const fakeTx = (rows: ReturnType<typeof birth>[]) => {
  const findMany = vi.fn().mockResolvedValue(rows);
  const create = vi.fn().mockResolvedValue({ id: "created-birth" });
  const update = vi.fn().mockResolvedValue({ id: "updated-birth" });
  return {
    tx: { lifeEvent: { findMany, create, update } } as unknown as Prisma.TransactionClient,
    findMany,
    create,
    update
  };
};

describe("selectCanonicalBirth", () => {
  it("picks the earliest created BIRTH, then the lowest id", () => {
    const earlier = birth("b", "2020-01-02T00:00:00Z", 1, 1, 1);
    const sameTimeLowerId = birth("a", "2020-01-02T00:00:00Z", 2, 2, 2);
    const oldest = birth("c", "2020-01-01T00:00:00Z", 3, 3, 3);
    expect(selectCanonicalBirth([earlier, sameTimeLowerId, oldest])?.id).toBe("c");
    expect(selectCanonicalBirth([earlier, sameTimeLowerId])?.id).toBe("a");
    expect(selectCanonicalBirth([])).toBeNull();
  });
});

describe("applyCanonicalBirth", () => {
  it("creates one EXACT BIRTH with empty place, notes, and no citation fields", async () => {
    const { tx, create, update } = fakeTx([]);
    const result = await applyCanonicalBirth(tx, "user-1", "person-1", {
      kind: "full",
      year: 1815,
      month: 12,
      day: 10
    });

    expect(result.birthdayResult).toBe("filled");
    expect(result).toMatchObject({ birthYear: 1815, birthMonth: 12, birthDay: 10, birthDate: "1815-12-10" });
    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        eventType: "BIRTH",
        dateQualifier: "EXACT",
        year: 1815,
        month: 12,
        day: 10,
        personProfileId: "person-1",
        placeId: null,
        notes: null,
        relationshipId: null
      })
    });
    expect(create.mock.calls[0]?.[0].data.citations).toBeUndefined();
  });

  it("fills an undated canonical birth and leaves qualifier, place, and notes alone", async () => {
    const { tx, create, update } = fakeTx([
      birth("birth-1", "2020-01-01T00:00:00Z", null, null, null, {
        dateQualifier: "ABOUT",
        placeId: "place-1",
        notes: "kept"
      })
    ]);
    const result = await applyCanonicalBirth(tx, "user-1", "person-1", {
      kind: "full",
      year: 1815,
      month: 12,
      day: 10
    });

    expect(result.birthdayResult).toBe("filled");
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "birth-1" },
      data: { year: 1815, month: 12, day: 10 }
    });
  });

  it("treats the same year, month, and day as equal for any qualifier", async () => {
    const row = birth("birth-1", "2020-01-01T00:00:00Z", 1815, 12, 10, { dateQualifier: "ESTIMATED" });
    const { tx, create, update } = fakeTx([row]);
    const result = await applyCanonicalBirth(tx, "user-1", "person-1", {
      kind: "full",
      year: 1815,
      month: 12,
      day: 10
    });

    expect(result.birthdayResult).toBe("equal");
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps a partial or different Treemich date and reports a conflict", async () => {
    const { tx, create, update } = fakeTx([birth("birth-1", "2020-01-01T00:00:00Z", 1900, 1, null)]);
    const result = await applyCanonicalBirth(tx, "user-1", "person-1", {
      kind: "full",
      year: 1900,
      month: 1,
      day: 2
    });

    expect(result.birthdayResult).toBe("conflict");
    expect(result).toMatchObject({ birthYear: 1900, birthMonth: 1, birthDay: null });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("writes nothing for an absent or malformed provider birthday", async () => {
    const row = birth("birth-1", "2020-01-01T00:00:00Z", 1900, 1, 2);
    const absent = fakeTx([row]);
    const absentResult = await applyCanonicalBirth(absent.tx, "user-1", "person-1", { kind: "absent" });
    expect(absentResult.birthdayResult).toBe("absent");
    expect(absentResult).toMatchObject({ birthYear: 1900, birthMonth: 1, birthDay: 2, birthDate: null });
    expect(absent.update).not.toHaveBeenCalled();

    const malformed = fakeTx([row]);
    const malformedResult = await applyCanonicalBirth(malformed.tx, "user-1", "person-1", {
      kind: "malformed",
      raw: "nope"
    });
    expect(malformedResult).toMatchObject({
      birthdayResult: "malformed",
      rawBirthDate: "nope",
      birthDate: null
    });
    expect(malformed.create).not.toHaveBeenCalled();
    expect(malformed.update).not.toHaveBeenCalled();
  });

  it("fills the earliest BIRTH when a later one is dated", async () => {
    const { tx, update, create } = fakeTx([
      birth("later", "2021-01-01T00:00:00Z", 2000, 1, 1),
      birth("earlier", "2020-01-01T00:00:00Z", null, null, null)
    ]);
    const result = await applyCanonicalBirth(tx, "user-1", "person-1", {
      kind: "full",
      year: 1815,
      month: 12,
      day: 10
    });

    expect(result.birthdayResult).toBe("filled");
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "earlier" },
      data: { year: 1815, month: 12, day: 10 }
    });
  });
});
