/**
 * @file Helpers to build account export ZIP archives (`account.json` + manifest) for `export-account.get`.
 */

import AdmZip from "adm-zip";

/** Primary snapshot inside the ZIP (UTF-8 JSON). */
export const ACCOUNT_EXPORT_JSON_PATH = "account.json";

/** Sidecar manifest describing the archive layout. */
export const ACCOUNT_EXPORT_MANIFEST_PATH = "manifest.json";

export type AccountExportManifestV1 = {
  treemichExportManifestVersion: 1;
  /** Same semantic as `exportVersion` inside `account.json`. */
  payloadExportVersion: number;
  exportedAt: string;
  files: ReadonlyArray<{ path: string; role: string }>;
};

export function buildAccountExportManifestV1(payload: {
  exportVersion: number;
  exportedAt: string;
}): AccountExportManifestV1 {
  return {
    treemichExportManifestVersion: 1,
    payloadExportVersion: payload.exportVersion,
    exportedAt: payload.exportedAt,
    files: [
      { path: ACCOUNT_EXPORT_JSON_PATH, role: "treemich_relational_snapshot" },
      { path: ACCOUNT_EXPORT_MANIFEST_PATH, role: "manifest" }
    ]
  };
}

/** Builds a ZIP containing `account.json` and `manifest.json` (no compression quirks for tiny payloads). */
export function zipAccountExport(accountJsonUtf8: string, manifest: AccountExportManifestV1): Buffer {
  const zip = new AdmZip();
  zip.addFile(ACCOUNT_EXPORT_JSON_PATH, Buffer.from(accountJsonUtf8, "utf8"));
  zip.addFile(ACCOUNT_EXPORT_MANIFEST_PATH, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));
  return zip.toBuffer();
}
