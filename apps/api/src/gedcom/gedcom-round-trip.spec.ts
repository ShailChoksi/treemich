import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildGedcomImportPreview, mergeIndiMatches, validateFamMatches } from "./importRunner.js";
import { buildGedcomDocument, normalizeGedcomForTest } from "./writer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("GEDCOM export → import preview (Phase 5 round-trip sanity)", () => {
  it("Treemich export with Immich hints re-parses with full INDI coverage and valid FAM pointers", () => {
    const { gedcomUtf8 } = buildGedcomDocument(
      {
        personProfiles: [
          {
            id: "pp-1",
            immichPersonId: "immich-a",
            gender: "MALE",
            givenName: "Pat",
            surname: "Fixture",
            displayNameOverride: null,
            externalIds: {}
          }
        ],
        relationships: [],
        families: [
          {
            id: "fam-x",
            parent1ImmichPersonId: "immich-a",
            parent2ImmichPersonId: null,
            notes: null,
            externalIds: { gedcomFam: "F9" },
            children: []
          }
        ],
        lifeEvents: [],
        personNames: [],
        repositories: [],
        sources: [],
        mediaObjects: [],
        mediaLinks: []
      },
      { includeTreemichCustomTags: true }
    );

    const preview = buildGedcomImportPreview(gedcomUtf8);
    const merged = mergeIndiMatches({}, preview.records);
    expect(merged.size).toBeGreaterThanOrEqual(1);
    expect(preview.indis.length).toBe(1);
    expect(validateFamMatches(preview, merged)).toBeNull();
    expect(preview.fams.length).toBe(1);
    const norm = normalizeGedcomForTest(gedcomUtf8);
    expect(norm).toMatch(/_TREEMICH_IMMICH_PERSON_ID/);
  });

  it("checked-in minimal UTF-8 fixture parses and matches when INDI is wired to Immich", () => {
    const ged = readFileSync(join(__dirname, "fixtures", "minimal-phase5.ged"), "utf8");
    const preview = buildGedcomImportPreview(ged);
    expect(preview.indis).toHaveLength(1);
    expect(preview.fams).toHaveLength(1);
    const merged = mergeIndiMatches({ I1: "any-immich-id" }, preview.records);
    expect(validateFamMatches(preview, merged)).toBeNull();
  });

  it("checked-in Gramps-style fixture covers sources, repositories, media, and FAM matching", () => {
    const ged = readFileSync(join(__dirname, "fixtures", "gramps-style-phase5.ged"), "utf8");
    const preview = buildGedcomImportPreview(ged);
    const merged = mergeIndiMatches({}, preview.records);

    expect(preview.indis.map((row) => row.immichHint).sort()).toEqual(["immich-ana", "immich-jose"]);
    expect(preview.fams).toEqual([
      {
        xref: "@F1@",
        husbXref: "@I1@",
        wifeXref: "@I2@",
        childXrefs: []
      }
    ]);
    expect(preview.media).toEqual([
      {
        xref: "@O1@",
        file: "https://example.test/evidence/birth-record.jpg",
        form: "image/jpeg",
        title: "Birth record scan"
      }
    ]);
    expect(validateFamMatches(preview, merged)).toBeNull();
  });
});
