/**
 * @packageDocumentation
 * Alternate name types, Zod DTOs for create/patch, and display formatting for Treemich person names.
 */

import { z } from "zod";

/** Genealogical name role for an alternate name row. */
export const personNameTypeValues = ["BIRTH", "MARRIED", "AKA", "MAIDEN", "RELIGIOUS", "OTHER"] as const;
export type PersonNameTypeValue = (typeof personNameTypeValues)[number];

export const personNameTypeLabels: Record<PersonNameTypeValue, string> = {
  BIRTH: "Birth name",
  MARRIED: "Married name",
  AKA: "Also known as",
  MAIDEN: "Maiden name",
  RELIGIOUS: "Religious name",
  OTHER: "Other"
};

export const personNameTypeSchema = z.enum(personNameTypeValues);

const optStr = z.union([z.string().max(500), z.null()]).optional();

/** `POST /people/:id/names` body. */
export const createPersonNameBodySchema = z.object({
  type: personNameTypeSchema,
  givenName: optStr,
  surname: optStr,
  prefix: optStr,
  suffix: optStr,
  notes: optStr,
  isPrimary: z.boolean().optional()
});
export type CreatePersonNameBody = z.infer<typeof createPersonNameBodySchema>;

/** `PATCH /people/:id/names/:nameId` body. */
export const patchPersonNameBodySchema = z.object({
  type: personNameTypeSchema.optional(),
  givenName: optStr,
  surname: optStr,
  prefix: optStr,
  suffix: optStr,
  notes: optStr,
  isPrimary: z.boolean().optional()
});
export type PatchPersonNameBody = z.infer<typeof patchPersonNameBodySchema>;

/** Single-line display for graph/search (skips empty parts). */
export const formatPersonNameDisplay = (parts: {
  prefix?: string | null;
  givenName?: string | null;
  surname?: string | null;
  suffix?: string | null;
}): string => {
  const pieces = [parts.prefix, parts.givenName, parts.surname, parts.suffix].filter(
    (p) => p != null && String(p).trim() !== ""
  ) as string[];
  return pieces.join(" ").replace(/\s+/g, " ").trim();
};
