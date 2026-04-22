import { describe, expect, it } from "vitest";
import {
  computeMarriageAfterDivorceFindings,
  computeParentBornAfterChildFindings
} from "./relationshipLifeEventValidation.js";

describe("computeMarriageAfterDivorceFindings", () => {
  it("returns empty if marriage or divorce is missing", () => {
    expect(computeMarriageAfterDivorceFindings([], { relationshipId: "r1" })).toEqual([]);
    expect(
      computeMarriageAfterDivorceFindings([{ eventType: "MARRIAGE", year: 2000, month: 1, day: 1 }], {
        relationshipId: "r1"
      })
    ).toEqual([]);
  });

  it("returns empty if years are not both known", () => {
    expect(
      computeMarriageAfterDivorceFindings(
        [
          { eventType: "MARRIAGE", year: null, month: 1, day: 1 },
          { eventType: "DIVORCE", year: 2010, month: 1, day: 1 }
        ],
        { relationshipId: "r1" }
      )
    ).toEqual([]);
  });

  it("flags marriage after divorce", () => {
    const f = computeMarriageAfterDivorceFindings(
      [
        { eventType: "DIVORCE", year: 2010, month: 1, day: 1 },
        { eventType: "MARRIAGE", year: 2012, month: 6, day: 1 }
      ],
      { relationshipId: "rel-a" }
    );
    expect(f).toEqual([
      {
        code: "marriage_after_divorce",
        severity: "error",
        message: "MARRIAGE is dated after DIVORCE for this relationship.",
        relationshipId: "rel-a"
      }
    ]);
  });
});

describe("computeParentBornAfterChildFindings", () => {
  it("returns empty when a birth is missing", () => {
    expect(
      computeParentBornAfterChildFindings({ year: 1980, month: 1, day: 1 }, null, {
        parentImmichPersonId: "a",
        childImmichPersonId: "b",
        relationshipId: "r"
      })
    ).toEqual([]);
  });

  it("returns empty when a birth year is missing", () => {
    expect(
      computeParentBornAfterChildFindings(
        { year: null, month: 1, day: 1 },
        { year: 2000, month: 1, day: 1 },
        { parentImmichPersonId: "a", childImmichPersonId: "b", relationshipId: "r" }
      )
    ).toEqual([]);
  });

  it("flags parent born after child", () => {
    const f = computeParentBornAfterChildFindings(
      { year: 2010, month: 1, day: 1 },
      { year: 2000, month: 1, day: 1 },
      { parentImmichPersonId: "p", childImmichPersonId: "c", relationshipId: "r1" }
    );
    expect(f[0]?.code).toBe("parent_birth_after_child");
    expect(f[0]?.immichPersonId).toBe("p");
    expect(f[0]?.relatedImmichPersonId).toBe("c");
  });
});
