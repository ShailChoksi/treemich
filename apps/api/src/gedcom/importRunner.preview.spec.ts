import { describe, expect, it } from "vitest";
import {
  buildGedcomImportPreview,
  capGedcomLineLog,
  enrichGedcomImportPreviewIndis,
  mergeIndiMatches,
  validateFamMatches
} from "./importRunner.js";

describe("buildGedcomImportPreview", () => {
  it("lists indis and fams and merges _TREEMICH hint into matches", () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Ann /Smith/
1 _TREEMICH_IMMICH_PERSON_ID person-a
0 @I2@ INDI
1 NAME Bob /Jones/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 @I3@ INDI
1 NAME Kid /Smith/
1 _TREEMICH_IMMICH_PERSON_ID person-c
0 TRLR
`;
    const p = buildGedcomImportPreview(ged);
    expect(p.indis.map((i) => i.xref).sort()).toEqual(["@I1@", "@I2@", "@I3@"].sort());
    expect(p.fams).toHaveLength(1);
    const m = mergeIndiMatches({}, p.records);
    expect(m.get("@I1@")).toBe("person-a");
    expect(m.get("@I3@")).toBe("person-c");
    expect(validateFamMatches(p, m)).toMatch(/I2|WIFE/);
    const m2 = mergeIndiMatches({ I2: "person-b" }, p.records);
    expect(validateFamMatches(p, m2)).toBeNull();
  });

  it("summarizes top-level OBJE media records", () => {
    const ged = `0 HEAD
0 @O1@ OBJE
1 FILE media/photo.jpg
1 FORM image/jpeg
1 TITL Portrait
0 TRLR
`;
    const p = buildGedcomImportPreview(ged);
    expect(p.media).toEqual([
      {
        xref: "@O1@",
        file: "media/photo.jpg",
        form: "image/jpeg",
        title: "Portrait"
      }
    ]);
  });

  it("caps lineLog with an explicit truncation warning", () => {
    const capped = capGedcomLineLog(
      [
        { severity: "warn", lineNo: 1, message: "first" },
        { severity: "warn", lineNo: 2, message: "second" },
        { severity: "error", lineNo: 3, message: "third" }
      ],
      2
    );

    expect(capped).toEqual([
      { severity: "warn", lineNo: 1, message: "first" },
      {
        severity: "warn",
        lineNo: 0,
        message: "GEDCOM import diagnostics truncated; 2 additional entries were omitted."
      }
    ]);
  });

  it("enriches indis with birth date, alternate names, and related people", () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Ann /Smith/
2 GIVN Ann
2 SURN Smith
1 NAME Ann /Jones/
2 TYPE married
1 BIRT
2 DATE ABT 15 JAN 1950
0 @I2@ INDI
1 NAME Bob /Jones/
0 @I3@ INDI
1 NAME Kid /Smith/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR
`;
    const p = buildGedcomImportPreview(ged);
    const enriched = enrichGedcomImportPreviewIndis(p);
    const ann = enriched.find((r) => r.xref === "@I1@");
    expect(ann?.fullName).toBe("Ann Smith");
    expect(ann?.alternateNames).toEqual(["Ann Jones"]);
    expect(ann?.birthDate).toBe("abt 15 Jan 1950");
    expect(ann?.relatedPeople.map((x) => `${x.label}:${x.name}`)).toEqual([
      "Spouse:Bob Jones",
      "Child:Kid Smith"
    ]);

    const bob = enriched.find((r) => r.xref === "@I2@");
    expect(bob?.relatedPeople.map((x) => `${x.label}:${x.name}`)).toEqual([
      "Spouse:Ann Smith",
      "Child:Kid Smith"
    ]);

    const kid = enriched.find((r) => r.xref === "@I3@");
    expect(kid?.relatedPeople.map((x) => `${x.label}:${x.name}`)).toEqual([
      "Parent:Ann Smith",
      "Parent:Bob Jones"
    ]);
  });
});
