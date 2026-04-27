import { describe, expect, it } from "vitest";
import { buildGedcomImportPreview, mergeIndiMatches, validateFamMatches } from "./importRunner.js";

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
});
