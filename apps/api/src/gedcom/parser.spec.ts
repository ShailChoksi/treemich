import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  gedcomDeclaredCharsetUnsupportedMessage,
  mergeConcCont,
  normalizeGedcomDeclaredCharset,
  normalizeIndiFamXref,
  parseGedcomDocument,
  parseTopLevelRecords,
  splitPhysicalLines
} from "./parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("gedcom parser", () => {
  it("normalizes xref keys", () => {
    expect(normalizeIndiFamXref("I0001")).toBe("@I0001@");
    expect(normalizeIndiFamXref("@I0001@")).toBe("@I0001@");
  });

  it("folds CONC into previous line", () => {
    const log: { severity: "warn" | "error"; lineNo: number; message: string }[] = [];
    const merged = mergeConcCont(["0 HEAD", "1 NOTE abc", "2 CONC def"], log);
    expect(merged).toEqual(["0 HEAD", "1 NOTE abcdef"]);
  });

  it("parses INDI and FAM records", () => {
    const ged = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Doe/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
0 TRLR
`;
    const { records, lineLog } = parseGedcomDocument(ged);
    expect(lineLog.filter((e) => e.severity === "error")).toHaveLength(0);
    expect(records.map((r) => [r.recordTag, r.xref])).toEqual([
      ["INDI", "@I1@"],
      ["FAM", "@F1@"]
    ]);
    const indi = records.find((r) => r.recordTag === "INDI")!;
    expect(indi.lines.some((l) => l.tag === "NAME")).toBe(true);
  });

  it("respects maxLines", () => {
    const lines = Array.from({ length: 5 }, (_, i) => `${i}`);
    const { records, lineLog } = parseGedcomDocument(lines.join("\n"), { maxLines: 3 });
    expect(records).toHaveLength(0);
    expect(lineLog.some((e) => e.severity === "error")).toBe(true);
  });

  it("parseTopLevelRecords skips junk", () => {
    const log: { severity: "warn" | "error"; lineNo: number; message: string }[] = [];
    const merged = splitPhysicalLines("0 @X@ INDI\nnot a gedcom line");
    const recs = parseTopLevelRecords(mergeConcCont(merged, log), log);
    expect(recs).toHaveLength(1);
  });

  it("transcodes ANSEL-declared files before parsing records", () => {
    const ged = `0 HEAD
1 CHAR ANSEL
0 @I1@ INDI
1 NAME Jos\xC2e /Nu\xC4nez/
0 TRLR
`;
    expect(gedcomDeclaredCharsetUnsupportedMessage(ged)).toBeNull();
    const normalized = normalizeGedcomDeclaredCharset(ged);
    expect(normalized.charset).toBe("ANSEL");
    expect(normalized.gedcomUtf8).toContain("1 CHAR UTF-8");
    expect(normalized.gedcomUtf8).toContain("José /Nuñez/");
    const { records, lineLog } = parseGedcomDocument(ged);
    expect(records).toHaveLength(1);
    expect(lineLog.some((e) => e.severity === "warn" && e.message.includes("ANSEL"))).toBe(true);
  });

  it("parses checked-in minimal GEDCOM golden fixture", () => {
    const ged = readFileSync(join(__dirname, "fixtures", "minimal-phase5.ged"), "utf8");
    const { records, lineLog } = parseGedcomDocument(ged);
    expect(lineLog.filter((e) => e.severity === "error")).toHaveLength(0);
    expect(records.map((r) => [r.recordTag, r.xref])).toEqual([
      ["INDI", "@I1@"],
      ["FAM", "@F9@"]
    ]);
  });
});
