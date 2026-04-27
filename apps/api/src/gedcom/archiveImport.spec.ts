import AdmZip from "adm-zip";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  maxGedcomImportBytes: () => 3_000_000,
  maxGedcomMediaArchiveBytes: () => 100_000_000,
  maxGedcomMediaFileBytes: () => 50_000_000
}));

describe("GEDCOM archive import helpers", () => {
  it("extracts one GEDCOM file and normalized media entries", async () => {
    const zip = new AdmZip();
    zip.addFile("tree.ged", Buffer.from("0 HEAD\n0 TRLR\n", "utf8"));
    zip.addFile("media/Portrait.JPG", Buffer.from("jpg"));

    const { findArchiveMediaFile, parseGedcomArchive } = await import("./archiveImport.js");
    const parsed = parseGedcomArchive(zip.toBuffer());

    expect(parsed.gedcomFileName).toBe("tree.ged");
    expect(parsed.mediaFiles).toHaveLength(1);
    expect(parsed.mediaFiles[0]?.normalizedPath).toBe("media/Portrait.JPG");
    expect(parsed.mediaFiles[0]?.mimeType).toBe("image/jpeg");
    expect(findArchiveMediaFile(parsed.mediaFiles, "C:\\export\\Portrait.JPG").file?.normalizedPath).toBe(
      "media/Portrait.JPG"
    );
  });

  it("rejects archives without exactly one GEDCOM file", async () => {
    const zip = new AdmZip();
    zip.addFile("a.ged", Buffer.from(""));
    zip.addFile("b.ged", Buffer.from(""));

    const { parseGedcomArchive } = await import("./archiveImport.js");
    expect(() => parseGedcomArchive(zip.toBuffer())).toThrow("exactly one .ged");
  });

  it("decodes ANSEL-declared GEDCOM entries as latin1 for parser transcoding", async () => {
    const zip = new AdmZip();
    zip.addFile(
      "tree.ged",
      Buffer.from("0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Jos\xC2e /Nu\xC4nez/\n0 TRLR\n", "latin1")
    );

    const { parseGedcomArchive } = await import("./archiveImport.js");
    const parsed = parseGedcomArchive(zip.toBuffer());

    expect(parsed.gedcomUtf8).toContain("1 CHAR ANSEL");
    expect(parsed.gedcomUtf8).toContain("Jos\xC2e /Nu\xC4nez/");
  });
});
