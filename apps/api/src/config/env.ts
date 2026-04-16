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
  RATE_LIMIT_TIME_WINDOW_MS: z.coerce.number().int().positive().default(60_000)
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = envSchema.parse(process.env);
