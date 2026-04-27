import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { env, maxGedcomMediaFileBytes } from "../config/env.js";

const STORAGE_KEY_RE = /^[a-f0-9-]{36}(?:\.[A-Za-z0-9]{1,12})?$/;

const safeExt = (name: string | null | undefined): string => {
  const ext = extname(basename(name ?? "")).toLowerCase();
  return /^[.][a-z0-9]{1,12}$/.test(ext) ? ext : "";
};

export const mediaStorageRoot = (): string => resolve(env.TREEMICH_MEDIA_STORAGE_DIR);

export const mediaDownloadUrlForKey = (storageKey: string): string =>
  `/api/evidence/media/file/${storageKey}`;

export const assertSafeStorageKey = (storageKey: string): string => {
  if (!STORAGE_KEY_RE.test(storageKey)) {
    const err = new Error("Invalid media storage key");
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
  return storageKey;
};

export const pathForStorageKey = (storageKey: string): string => {
  const safeKey = assertSafeStorageKey(storageKey);
  return resolve(mediaStorageRoot(), safeKey);
};

export const storageKeyFromUrl = (storageUrl: string): string | null => {
  const prefix = "/api/evidence/media/file/";
  if (!storageUrl.startsWith(prefix)) {
    return null;
  }
  try {
    return assertSafeStorageKey(decodeURIComponent(storageUrl.slice(prefix.length)));
  } catch {
    return null;
  }
};

export type StoredMediaBuffer = {
  storageKey: string;
  storageUrl: string;
  checksum: string;
  byteSize: number;
};

export async function storeMediaBuffer(
  buffer: Buffer,
  options?: { originalName?: string | null; maxBytes?: number }
): Promise<StoredMediaBuffer> {
  const maxBytes = options?.maxBytes ?? maxGedcomMediaFileBytes();
  if (buffer.byteLength > maxBytes) {
    const err = new Error(`Media file exceeds max size (${maxBytes} bytes)`);
    (err as Error & { statusCode: number }).statusCode = 413;
    throw err;
  }

  await mkdir(mediaStorageRoot(), { recursive: true });
  const storageKey = `${randomUUID()}${safeExt(options?.originalName)}`;
  const filePath = pathForStorageKey(storageKey);
  await writeFile(filePath, buffer, { flag: "wx" });
  return {
    storageKey,
    storageUrl: mediaDownloadUrlForKey(storageKey),
    checksum: createHash("sha256").update(buffer).digest("hex"),
    byteSize: buffer.byteLength
  };
}

export async function storeMediaFile(
  sourcePath: string,
  options?: { originalName?: string | null; maxBytes?: number }
): Promise<StoredMediaBuffer> {
  const size = (await stat(sourcePath)).size;
  const maxBytes = options?.maxBytes ?? maxGedcomMediaFileBytes();
  if (size > maxBytes) {
    const err = new Error(`Media file exceeds max size (${maxBytes} bytes)`);
    (err as Error & { statusCode: number }).statusCode = 413;
    throw err;
  }
  return storeMediaBuffer(await readFile(sourcePath), { ...options, maxBytes });
}

export async function removeStoredMediaByUrl(storageUrl: string): Promise<void> {
  const key = storageKeyFromUrl(storageUrl);
  if (!key) {
    return;
  }
  await rm(pathForStorageKey(key), { force: true });
}

export async function openStoredMediaReadStream(storageKey: string): Promise<{
  stream: ReturnType<typeof createReadStream>;
  byteSize: number;
}> {
  const filePath = pathForStorageKey(storageKey);
  const s = await stat(filePath);
  return { stream: createReadStream(filePath), byteSize: s.size };
}
