/**
 * @packageDocumentation
 * Typed process environment for the API: loads repo-root `.env`, parses with Zod, exposes feature toggles.
 */

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const resolveEnvFilePath = () => {
  if (process.env.TREEMICH_ENV_FILE) {
    return process.env.TREEMICH_ENV_FILE;
  }

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(moduleDir, "../../../.env"),
    resolve(moduleDir, "../../../../.env")
  ];
  return candidates.find((candidate) => existsSync(candidate));
};

const envFilePath = resolveEnvFilePath();
config(envFilePath ? { path: envFilePath } : undefined);

const optionalBooleanString = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value == null || value === "") {
      return false;
    }
    const normalized = value.toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected boolean-like value: true/false, 1/0, yes/no, on/off"
    });
    return z.NEVER;
  });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    /** Optional Immich provider URL; only required when linking/importing Immich data. */
    IMMICH_BASE_URL: z.string().url().optional().default("http://localhost:2283/api"),
    IMMICH_PEOPLE_PAGE_SIZE: z.coerce.number().int().positive().default(1000),
    IMMICH_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    IMMICH_HTTP_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
    IMMICH_HTTP_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(200),
    WEB_ORIGIN: z.string().url().optional(),
    TREEMICH_TRUST_PROXY: optionalBooleanString,
    TREEMICH_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "TREEMICH_ENCRYPTION_KEY must be a 64-character hex string"),
    TREEMICH_SESSION_COOKIE_NAME: z.string().min(1).default("treemich_session"),
    TREEMICH_SESSION_TTL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(1000 * 60 * 60 * 24 * 30),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_TIME_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    /** Stale GEDCOM import/export jobs may be reclaimed after this age (default: 24 hours). */
    TREEMICH_GEDCOM_JOB_STALE_AFTER_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(24 * 60 * 60 * 1000),
    /** Maximum aggregate rows a synchronous account/GEDCOM export will load into memory. */
    TREEMICH_EXPORT_MAX_ROWS: z.coerce.number().int().positive().default(100_000),
    /** Maximum profiles + relationships load allowed in full tree validation before rejecting request. */
    TREEMICH_TREE_VALIDATION_MAX_ROWS: z.coerce.number().int().positive().default(50_000),
    /** Maximum number of place aggregates returned by `GET /places/map`. */
    TREEMICH_PLACES_MAP_MAX_POINTS: z.coerce.number().int().positive().default(2000),
    /** When "false" / "0" / "no" / "off", `GET /tree/validation` returns empty `findings` (omitted in omitted env). */
    TREEMICH_VALIDATION_ENGINE_ENABLED: z.string().optional(),
    /** When "false" / "0" / "no" / "off", `GET /places/map` returns no place points for map UI. */
    MAP_UI_ENABLED: z.string().optional(),
    /** When "false" / "0" / "no" / "off", skip automatic geocoding for profile birth city/country edits. */
    TREEMICH_PROFILE_PLACE_GEOCODING_ENABLED: z.string().optional(),
    /**
     * When "false" / "0" / "no" / "off", disables Phase 4 family HTTP routes (`/families`, `/people/:id/families`,
     * `/families/:id/life-events`). Default when unset: enabled.
     */
    TREEMICH_FAMILY_MODEL_ENABLED: z.string().optional(),
    /**
     * When "false" / "0" / "no" / "off", skips the **one-time** automatic Phase 4 family backfill on API boot
     * (infer `Family` rows from untagged `PARENT_OF` edges). Default when unset: **enabled** so upgrades
     * populate family units without a manual script.
     */
    TREEMICH_AUTO_PHASE4_FAMILY_BACKFILL: z.string().optional(),
    /**
     * When "false" / "0" / "no" / "off", disables `GET /export/gedcom` (Phase 5a GEDCOM export).
     * Default when unset: enabled.
     */
    TREEMICH_GEDCOM_EXPORT_ENABLED: z.string().optional(),
    /**
     * When "true" / "1" / "yes" / "on", enables `POST /import/gedcom/*` (Phase 5b). Default when unset: **disabled**
     * so imports never run accidentally.
     */
    TREEMICH_GEDCOM_IMPORT_ENABLED: z.string().optional(),
    /** Max UTF-8 byte length for `gedcomUtf8` on import endpoints (default 3_000_000). */
    TREEMICH_GEDCOM_IMPORT_MAX_BYTES: z.coerce.number().int().positive().optional(),
    /** Max physical lines accepted by the GEDCOM parser (default 250_000). */
    TREEMICH_GEDCOM_IMPORT_MAX_LINES: z.coerce.number().int().positive().optional(),
    /** Max line-log entries returned on job GET / stored on create (default 2000). */
    TREEMICH_GEDCOM_IMPORT_MAX_LINE_LOG: z.coerce.number().int().positive().optional(),
    /** Durable local directory for imported evidence media files. */
    TREEMICH_MEDIA_STORAGE_DIR: z.string().min(1).default("data/media"),
    /** Max ZIP upload size for GEDCOM + media archive imports (default 100 MB). */
    TREEMICH_GEDCOM_MEDIA_MAX_BYTES: z.coerce.number().int().positive().optional(),
    /** Max individual media file size accepted from GEDCOM archive imports (default 50 MB). */
    TREEMICH_GEDCOM_MEDIA_MAX_FILE_BYTES: z.coerce.number().int().positive().optional()
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.WEB_ORIGIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WEB_ORIGIN"],
        message: "WEB_ORIGIN is required when NODE_ENV=production"
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

/** Parsed and validated environment (throws at boot on misconfiguration). */
export const env: AppEnv = envSchema.parse(process.env);

/** Feature flag: whole-tree validation engine (`GET /tree/validation`). */
export const isTreeValidationEngineEnabled = (): boolean => {
  const v = env.TREEMICH_VALIDATION_ENGINE_ENABLED;
  if (v == null || v === "") {
    return true;
  }
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
};

/** Feature flag: geocoded places map feed (`GET /places/map`). */
export const isMapUiEnabled = (): boolean => {
  const v = env.MAP_UI_ENABLED;
  if (v == null || v === "") {
    return true;
  }
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
};

/** Feature flag: Nominatim backfill when profile birth city/country is saved. */
export const isProfilePlaceGeocodingEnabled = (): boolean => {
  const v = env.TREEMICH_PROFILE_PLACE_GEOCODING_ENABLED;
  if (v == null || v === "") {
    return true;
  }
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
};

/** Feature flag: Phase 4 family model HTTP surface. */
export const isFamilyModelEnabled = (): boolean => {
  const v = env.TREEMICH_FAMILY_MODEL_ENABLED;
  if (v == null || v === "") {
    return true;
  }
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
};

/** One-shot automatic family backfill after DB upgrade (see `maybeRunAutomaticPhase4FamilyBackfillOnBoot`). */
export const isAutoPhase4FamilyBackfillEnabled = (): boolean => {
  const v = env.TREEMICH_AUTO_PHASE4_FAMILY_BACKFILL;
  if (v == null || v === "") {
    return true;
  }
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
};

/** Phase 5a: `GET /export/gedcom` (GEDCOM 5.5.1 UTF-8 + optional ZIP xref sidecar). */
export const isGedcomExportEnabled = (): boolean => {
  const v = env.TREEMICH_GEDCOM_EXPORT_ENABLED;
  if (v == null || v === "") {
    return true;
  }
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
};

/** Phase 5b: GEDCOM import (`POST /import/gedcom/*`). Default **off** when unset. */
export const isGedcomImportEnabled = (): boolean => {
  const v = env.TREEMICH_GEDCOM_IMPORT_ENABLED;
  if (v == null || v === "") {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
};

export const maxGedcomImportBytes = (): number => env.TREEMICH_GEDCOM_IMPORT_MAX_BYTES ?? 3_000_000;

export const maxGedcomImportLineLogEntries = (): number => env.TREEMICH_GEDCOM_IMPORT_MAX_LINE_LOG ?? 2000;

export const maxGedcomImportLines = (): number => env.TREEMICH_GEDCOM_IMPORT_MAX_LINES ?? 250_000;

export const maxGedcomMediaArchiveBytes = (): number => env.TREEMICH_GEDCOM_MEDIA_MAX_BYTES ?? 100_000_000;

export const maxGedcomMediaFileBytes = (): number => env.TREEMICH_GEDCOM_MEDIA_MAX_FILE_BYTES ?? 50_000_000;
