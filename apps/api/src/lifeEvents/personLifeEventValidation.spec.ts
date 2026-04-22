import { describe, expect, it } from "vitest";
import { computePersonLifeEventFindings } from "./personLifeEventValidation.js";

describe("computePersonLifeEventFindings", () => {
  it("returns empty when birth or death is missing", () => {
    expect(computePersonLifeEventFindings([{ eventType: "BIRTH", year: 2000, month: 1, day: 1 }])).toEqual(
      []
    );
  });

  it("returns empty when birth or death year is missing", () => {
    expect(
      computePersonLifeEventFindings([
        { eventType: "BIRTH", year: null, month: 1, day: 1 },
        { eventType: "DEATH", year: 1990, month: null, day: null }
      ])
    ).toEqual([]);
  });

  it("emits birth_after_death when birth sorts after death", () => {
    const findings = computePersonLifeEventFindings([
      { eventType: "BIRTH", year: 2000, month: null, day: null },
      { eventType: "DEATH", year: 1990, month: null, day: null }
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("birth_after_death");
    expect(findings[0]?.severity).toBe("error");
  });

  it("returns empty when birth is before death", () => {
    expect(
      computePersonLifeEventFindings([
        { eventType: "BIRTH", year: 1980, month: 6, day: 1 },
        { eventType: "DEATH", year: 2020, month: 1, day: 1 }
      ])
    ).toEqual([]);
  });

  it("uses first BIRTH and first DEATH when multiple exist", () => {
    const findings = computePersonLifeEventFindings([
      { eventType: "BIRTH", year: 2010, month: null, day: null },
      { eventType: "BIRTH", year: 1980, month: null, day: null },
      { eventType: "DEATH", year: 2000, month: null, day: null }
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("birth_after_death");
  });

  it("detects birth_after_death on same calendar year with later birth month", () => {
    const findings = computePersonLifeEventFindings([
      { eventType: "BIRTH", year: 2000, month: 12, day: 1 },
      { eventType: "DEATH", year: 2000, month: 1, day: 1 }
    ]);
    expect(findings.map((f) => f.code)).toEqual(["birth_after_death"]);
  });

  it("detects birth_after_death on same year and month with later birth day", () => {
    const findings = computePersonLifeEventFindings([
      { eventType: "BIRTH", year: 2000, month: 6, day: 15 },
      { eventType: "DEATH", year: 2000, month: 6, day: 1 }
    ]);
    expect(findings.map((f) => f.code)).toEqual(["birth_after_death"]);
  });

  it("returns empty when same year but birth month is before death month", () => {
    expect(
      computePersonLifeEventFindings([
        { eventType: "BIRTH", year: 2000, month: 3, day: 1 },
        { eventType: "DEATH", year: 2000, month: 6, day: 1 }
      ])
    ).toEqual([]);
  });
});
