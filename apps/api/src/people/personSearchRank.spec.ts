import type { PersonRecord } from "@treemich/shared";
import { describe, expect, it } from "vitest";
import { comparePersonSearchSortKeys, personRecordSearchSortKey } from "./personSearchRank.js";

const person = (overrides: Partial<PersonRecord> & Pick<PersonRecord, "id" | "name">): PersonRecord => ({
  id: overrides.id,
  name: overrides.name,
  displayName: overrides.displayName ?? null,
  birthDate: overrides.birthDate ?? null,
  thumbnailPath: overrides.thumbnailPath ?? null,
  profile: overrides.profile ?? {
    id: overrides.id,
    gender: "UNKNOWN",
    givenName: null,
    surname: null,
    nicknames: null,
    externalIds: {}
  },
  externalIdentities: overrides.externalIdentities ?? [],
  thumbnail: overrides.thumbnail ?? null,
  hasRelationship: overrides.hasRelationship ?? false
});

describe("personRecordSearchSortKey", () => {
  it("ranks exact display name before prefix before substring", () => {
    const q = "ann";
    const exact = person({
      id: "p1",
      name: "Ann",
      profile: {
        id: "p1",
        gender: "UNKNOWN",
        givenName: "Ann",
        surname: "Lee",
        nicknames: null,
        externalIds: {}
      }
    });
    const prefix = person({
      id: "p2",
      name: "Anna Smith",
      profile: {
        id: "p2",
        gender: "UNKNOWN",
        givenName: "Anna",
        surname: "Smith",
        nicknames: null,
        externalIds: {}
      }
    });
    const substring = person({
      id: "p3",
      name: "Joanna",
      profile: {
        id: "p3",
        gender: "UNKNOWN",
        givenName: "Joanna",
        surname: "X",
        nicknames: null,
        externalIds: {}
      }
    });
    const keys = [substring, exact, prefix].map((p) => personRecordSearchSortKey(p, q));
    const sorted = [...keys].sort(comparePersonSearchSortKeys);
    expect(sorted[0]).toEqual(personRecordSearchSortKey(exact, q));
    expect(sorted[1]).toEqual(personRecordSearchSortKey(prefix, q));
    expect(sorted[2]).toEqual(personRecordSearchSortKey(substring, q));
  });

  it("uses stable name then id tie-break for equal tiers", () => {
    const q = "x";
    const a = person({
      id: "b-id",
      name: "Beta",
      profile: {
        id: "b-id",
        gender: "UNKNOWN",
        givenName: "Ax",
        surname: null,
        nicknames: null,
        externalIds: {}
      }
    });
    const b = person({
      id: "a-id",
      name: "Alpha",
      profile: {
        id: "a-id",
        gender: "UNKNOWN",
        givenName: "Bx",
        surname: null,
        nicknames: null,
        externalIds: {}
      }
    });
    const keys = [b, a].map((p) => personRecordSearchSortKey(p, q));
    const sorted = [...keys].sort(comparePersonSearchSortKeys);
    expect(sorted).toHaveLength(2);
    expect(sorted[0]![1]).toBe("alpha");
    expect(sorted[1]![1]).toBe("beta");
  });
});
