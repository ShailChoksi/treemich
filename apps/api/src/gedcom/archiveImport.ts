import AdmZip from "adm-zip";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { mediaStorageRoot } from "../evidence/mediaStorage.js";
import { maxGedcomImportBytes, maxGedcomMediaArchiveBytes, maxGedcomMediaFileBytes } from "../config/env.js";
import type { GedcomLineLogEntry } from "./parser.js";

export type GedcomArchiveMediaFile = {
  normalizedPath: string;
  originalPath: string;
  basename: string;
  byteSize: number;
  mimeType: string | null;
  buffer: Buffer;
};

export type StagedGedcomArchiveMediaFile = Omit<GedcomArchiveMediaFile, "buffer"> & {
  stagedPath: string;
};

export type GedcomArchiveParseResult = {
  gedcomUtf8: string;
  gedcomFileName: string;
  mediaFiles: GedcomArchiveMediaFile[];
  lineLog: GedcomLineLogEntry[];
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  pdf: "application/pdf",
  txt: "text/plain"
};

const decodeZipName = (name: string): string => name.replace(/\\/g, "/").replace(/^\/+/, "");

export const normalizeArchivePath = (raw: string): string | null => {
  const trimmed = raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^[A-Za-z]:\//, "")
    .replace(/^\/+/, "");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === "." || p === "..")) {
    return null;
  }
  return parts.join("/");
};

const guessMimeType = (path: string): string | null => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? null;
};

const decodeGedcomEntry = (buffer: Buffer): string => {
  const latin1Probe = buffer.toString("latin1", 0, Math.min(buffer.byteLength, 8192));
  if (/^\d+\s+CHAR\s+ANSEL\b/im.test(latin1Probe)) {
    return buffer.toString("latin1");
  }
  return buffer.toString("utf8");
};

export const findArchiveMediaFile = (
  files: readonly (GedcomArchiveMediaFile | StagedGedcomArchiveMediaFile)[],
  gedcomFileValue: string
): { file: GedcomArchiveMediaFile | StagedGedcomArchiveMediaFile | null; warning: string | null } => {
  const normalized = normalizeArchivePath(gedcomFileValue);
  if (!normalized) {
    return { file: null, warning: `OBJE FILE path is unsafe or empty: ${gedcomFileValue}` };
  }

  const exact = files.find((f) => f.normalizedPath.toLowerCase() === normalized.toLowerCase());
  if (exact) {
    return { file: exact, warning: null };
  }

  const wantedBase = basename(normalized).toLowerCase();
  const basenameMatches = files.filter((f) => f.basename.toLowerCase() === wantedBase);
  if (basenameMatches.length === 1) {
    return {
      file: basenameMatches[0]!,
      warning: `OBJE FILE ${gedcomFileValue} matched archive file ${basenameMatches[0]!.normalizedPath} by basename`
    };
  }
  if (basenameMatches.length > 1) {
    return { file: null, warning: `OBJE FILE ${gedcomFileValue} has multiple basename matches in archive` };
  }
  return { file: null, warning: `OBJE FILE ${gedcomFileValue} was not found in archive` };
};

export function parseGedcomArchive(buffer: Buffer): GedcomArchiveParseResult {
  if (buffer.byteLength > maxGedcomMediaArchiveBytes()) {
    const err = new Error(`GEDCOM media archive exceeds max size (${maxGedcomMediaArchiveBytes()} bytes)`);
    (err as Error & { statusCode: number }).statusCode = 413;
    throw err;
  }

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const lineLog: GedcomLineLogEntry[] = [];
  const gedEntries = entries.filter((entry) => entry.entryName.toLowerCase().endsWith(".ged"));
  if (gedEntries.length !== 1) {
    const err = new Error("GEDCOM archive must contain exactly one .ged file");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }

  const gedEntry = gedEntries[0]!;
  const gedBuffer = gedEntry.getData();
  if (gedBuffer.byteLength > maxGedcomImportBytes()) {
    const err = new Error(`GEDCOM file exceeds max size (${maxGedcomImportBytes()} bytes)`);
    (err as Error & { statusCode: number }).statusCode = 413;
    throw err;
  }

  const mediaFiles: GedcomArchiveMediaFile[] = [];
  for (const entry of entries) {
    if (entry === gedEntry) {
      continue;
    }
    const normalized = normalizeArchivePath(decodeZipName(entry.entryName));
    if (!normalized) {
      lineLog.push({
        severity: "warn",
        lineNo: 0,
        message: `Skipping unsafe archive entry ${entry.entryName}`
      });
      continue;
    }
    const data = entry.getData();
    if (data.byteLength > maxGedcomMediaFileBytes()) {
      lineLog.push({
        severity: "warn",
        lineNo: 0,
        message: `Skipping media ${normalized}: exceeds max file size (${maxGedcomMediaFileBytes()} bytes)`
      });
      continue;
    }
    mediaFiles.push({
      normalizedPath: normalized,
      originalPath: entry.entryName,
      basename: basename(normalized),
      byteSize: data.byteLength,
      mimeType: guessMimeType(normalized),
      buffer: data
    });
  }

  return {
    gedcomUtf8: decodeGedcomEntry(gedBuffer),
    gedcomFileName: basename(gedEntry.entryName) || "import.ged",
    mediaFiles,
    lineLog
  };
}

export async function stageGedcomArchiveMediaFiles(
  jobId: string,
  files: readonly GedcomArchiveMediaFile[]
): Promise<{ archiveDir: string; files: StagedGedcomArchiveMediaFile[] }> {
  const archiveDir = resolve(mediaStorageRoot(), "import-staging", jobId);
  await rm(archiveDir, { recursive: true, force: true });
  await mkdir(archiveDir, { recursive: true });

  const staged: StagedGedcomArchiveMediaFile[] = [];
  for (const file of files) {
    const stagedPath = resolve(archiveDir, `${staged.length}-${basename(file.normalizedPath)}`);
    await writeFile(stagedPath, file.buffer, { flag: "wx" });
    staged.push({
      normalizedPath: file.normalizedPath,
      originalPath: file.originalPath,
      basename: file.basename,
      byteSize: file.byteSize,
      mimeType: file.mimeType,
      stagedPath
    });
  }
  return { archiveDir, files: staged };
}
