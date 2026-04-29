/**
 * @file ZIP bundle for `GET /export/gedcom?format=zip` (GEDCOM + xref sidecar + manifest).
 */

import AdmZip from "adm-zip";
import type { GedcomXrefSidecarV1 } from "../gedcom/writer.js";

export const GEDCOM_EXPORT_GED_PATH = "treemich.ged";

export const GEDCOM_EXPORT_XREF_PATH = "treemich-gedcom-xrefs.json";

export const GEDCOM_EXPORT_MANIFEST_PATH = "manifest.json";

export type GedcomZipManifestV1 = {
  treemichGedcomZipManifestVersion: 1;
  exportedAt: string;
  gedcomVersion: "5.5.1";
  files: ReadonlyArray<{ path: string; role: string }>;
};

export function buildGedcomZipManifestV1(exportedAt: string): GedcomZipManifestV1 {
  return {
    treemichGedcomZipManifestVersion: 1,
    exportedAt,
    gedcomVersion: "5.5.1",
    files: [
      { path: GEDCOM_EXPORT_GED_PATH, role: "gedcom_utf8" },
      { path: GEDCOM_EXPORT_XREF_PATH, role: "xref_sidecar" },
      { path: GEDCOM_EXPORT_MANIFEST_PATH, role: "manifest" }
    ]
  };
}

export function zipGedcomExport(
  gedcomUtf8: string,
  xrefs: GedcomXrefSidecarV1,
  manifest: GedcomZipManifestV1
): Buffer {
  const zip = new AdmZip();
  zip.addFile(GEDCOM_EXPORT_GED_PATH, Buffer.from(gedcomUtf8, "utf8"));
  zip.addFile(GEDCOM_EXPORT_XREF_PATH, Buffer.from(`${JSON.stringify(xrefs, null, 2)}\n`, "utf8"));
  zip.addFile(GEDCOM_EXPORT_MANIFEST_PATH, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));
  return zip.toBuffer();
}
