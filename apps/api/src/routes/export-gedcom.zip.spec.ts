import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import {
  buildGedcomZipManifestV1,
  GEDCOM_EXPORT_GED_PATH,
  GEDCOM_EXPORT_MANIFEST_PATH,
  GEDCOM_EXPORT_XREF_PATH,
  zipGedcomExport
} from "./export-gedcom.zip.js";

describe("zipGedcomExport", () => {
  it("includes .ged, xref JSON, and manifest", () => {
    const xrefs = {
      treemichGedcomXrefMapVersion: 1 as const,
      indi: { I0001: { personId: "pp1" } },
      fam: {},
      sour: {},
      repo: {},
      obje: {}
    };
    const manifest = buildGedcomZipManifestV1("2026-04-22T00:00:00.000Z");
    const buf = zipGedcomExport("0 HEAD\n1 CHAR UTF-8\n0 TRLR\n", xrefs, manifest);
    const zip = new AdmZip(buf);
    expect(
      zip
        .getEntries()
        .map((e) => e.entryName)
        .sort()
    ).toEqual([GEDCOM_EXPORT_GED_PATH, GEDCOM_EXPORT_MANIFEST_PATH, GEDCOM_EXPORT_XREF_PATH].sort());
    expect(zip.readAsText(GEDCOM_EXPORT_GED_PATH)).toContain("HEAD");
    const parsed = JSON.parse(zip.readAsText(GEDCOM_EXPORT_XREF_PATH)) as typeof xrefs;
    expect(parsed.indi["I0001"]?.personId).toBe("pp1");
    const man = JSON.parse(zip.readAsText(GEDCOM_EXPORT_MANIFEST_PATH)) as {
      treemichGedcomZipManifestVersion: number;
    };
    expect(man.treemichGedcomZipManifestVersion).toBe(1);
  });
});
