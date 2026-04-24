/**
 * @packageDocumentation
 * Typed process environment for the API: loads repo-root `.env`, parses with Zod, exposes feature toggles.
 */

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const envFilePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env");
config({ path: envFilePath });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  IMMICH_BASE_URL: z.string().url(),
  IMMICH_PEOPLE_PAGE_SIZE: z.coerce.number().int().positive().default(1000),
  WEB_ORIGIN: z.string().url().optional(),
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
  TREEMICH_AUTO_PHASE4_FAMILY_BACKFILL: z.string().optional()
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
