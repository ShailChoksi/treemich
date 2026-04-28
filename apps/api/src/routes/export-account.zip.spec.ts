import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import {
  ACCOUNT_EXPORT_JSON_PATH,
  ACCOUNT_EXPORT_MANIFEST_PATH,
  buildAccountExportManifestV1,
  zipAccountExport
} from "./export-account.zip.js";

describe("export-account zip", () => {
  it("builds manifest v1 with expected files list", () => {
    const manifest = buildAccountExportManifestV1({
      exportVersion: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      extraFiles: [
        {
          path: "thumbnails/person-1/thumb-1.jpg",
          role: "person_thumbnail_binary",
          personId: "person-1",
          personThumbnailId: "thumb-1"
        }
      ]
    });
    expect(manifest.treemichExportManifestVersion).toBe(1);
    expect(manifest.payloadExportVersion).toBe(1);
    expect(manifest.exportedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(manifest.files.map((f) => f.path)).toEqual([
      ACCOUNT_EXPORT_JSON_PATH,
      "thumbnails/person-1/thumb-1.jpg",
      ACCOUNT_EXPORT_MANIFEST_PATH
    ]);
  });

  it("zips account JSON and manifest and round-trips via AdmZip", () => {
    const account = JSON.stringify({ exportVersion: 1, hello: "treemich" });
    const manifest = buildAccountExportManifestV1({
      exportVersion: 1,
      exportedAt: "2026-04-21T12:00:00.000Z"
    });
    const buf = zipAccountExport(account, manifest, [
      {
        path: "thumbnails/person-1/thumb-1.jpg",
        role: "person_thumbnail_binary",
        data: Buffer.from("image-bytes")
      }
    ]);
    expect(buf.subarray(0, 2).toString("utf8")).toBe("PK");

    const zip = new AdmZip(buf);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain(ACCOUNT_EXPORT_JSON_PATH);
    expect(names).toContain(ACCOUNT_EXPORT_MANIFEST_PATH);
    expect(names).toContain("thumbnails/person-1/thumb-1.jpg");

    const roundAccount = zip.readAsText(ACCOUNT_EXPORT_JSON_PATH);
    expect(JSON.parse(roundAccount)).toEqual({ exportVersion: 1, hello: "treemich" });

    const roundManifest = JSON.parse(zip.readAsText(ACCOUNT_EXPORT_MANIFEST_PATH)) as {
      treemichExportManifestVersion: number;
      payloadExportVersion: number;
    };
    expect(roundManifest.treemichExportManifestVersion).toBe(1);
    expect(roundManifest.payloadExportVersion).toBe(1);
    expect(zip.readFile("thumbnails/person-1/thumb-1.jpg")?.toString("utf8")).toBe("image-bytes");
  });
});
