/**
 * @packageDocumentation
 * Zod request bodies and TypeScript types for Treemich life events (person and relationship scoped),
 * including partial dates, places, and citations.
 */

import { z } from "zod";

/** GEDCOM-style date precision / qualifier for a life event date. */
export const dateQualifierValues = [
  "EXACT",
  "ABOUT",
  "BEFORE",
  "AFTER",
  "BETWEEN",
  "CALCULATED",
  "ESTIMATED"
] as const;
export type DateQualifierValue = (typeof dateQualifierValues)[number];

/** All life-event kinds Treemich can store (subset may be used per API route). */
export const lifeEventTypeValues = [
  "BIRTH",
  "DEATH",
  "MARRIAGE",
  "DIVORCE",
  "BURIAL",
  "CHRISTENING",
  "RESIDENCE",
  "IMMIGRATION",
  "CUSTOM",
  "BAPTISM",
  "CENSUS",
  "MILITARY"
] as const;
export type LifeEventTypeValue = (typeof lifeEventTypeValues)[number];

/** MARRIAGE / DIVORCE must be created on a relationship, not on a person profile. */
export const relationshipScopedLifeEventTypeValues = ["MARRIAGE", "DIVORCE"] as const;
export type RelationshipScopedLifeEventTypeValue = (typeof relationshipScopedLifeEventTypeValues)[number];

const relationshipScopedLifeEventTypeSet = new Set<string>(relationshipScopedLifeEventTypeValues);

/** Event types allowed on `POST /people/:id/life-events` (excludes relationship-only types). */
export const personAttachableLifeEventTypeValues = lifeEventTypeValues.filter(
  (t) => !relationshipScopedLifeEventTypeSet.has(t)
);

export const lifeEventTypeLabels: Record<LifeEventTypeValue, string> = {
  BIRTH: "Birth",
  DEATH: "Death",
  MARRIAGE: "Marriage",
  DIVORCE: "Divorce",
  BURIAL: "Burial",
  CHRISTENING: "Christening",
  RESIDENCE: "Residence",
  IMMIGRATION: "Immigration",
  CUSTOM: "Custom",
  BAPTISM: "Baptism",
  CENSUS: "Census",
  MILITARY: "Military"
};

/** UI grouping for life-event type pickers (subset filtered by allowed types per context). */
export const lifeEventTypePickerGroups: readonly {
  readonly id: string;
  readonly label: string;
  readonly types: readonly LifeEventTypeValue[];
}[] = [
  {
    id: "vital",
    label: "Vital & sacraments",
    types: ["BIRTH", "DEATH", "BURIAL", "BAPTISM", "CHRISTENING"]
  },
  {
    id: "union",
    label: "Union",
    types: ["MARRIAGE", "DIVORCE"]
  },
  {
    id: "life",
    label: "Life, residence & records",
    types: ["RESIDENCE", "IMMIGRATION", "CENSUS", "MILITARY", "CUSTOM"]
  }
];

/** Compact hint for list rows (use with visible type label; decorative only). */
export const lifeEventTypeUiGlyph: Record<LifeEventTypeValue, string> = {
  BIRTH: "🍼",
  DEATH: "†",
  MARRIAGE: "♥",
  DIVORCE: "⎘",
  BURIAL: "⚱",
  CHRISTENING: "◯",
  RESIDENCE: "⌂",
  IMMIGRATION: "⇄",
  CUSTOM: "✎",
  BAPTISM: "✝",
  CENSUS: "⌗",
  MILITARY: "⚔"
};

export const dateQualifierSchema = z.enum(dateQualifierValues);
export const lifeEventTypeSchema = z.enum(lifeEventTypeValues);

const yearSchema = z.number().int().min(1).max(9999);
const monthSchema = z.number().int().min(1).max(12);
const daySchema = z.number().int().min(1).max(31);

/** Partial calendar date fields (nullable pieces); API validates sensible combinations. */
export const partialDatePartsSchema = z.object({
  year: yearSchema.optional().nullable(),
  month: monthSchema.optional().nullable(),
  day: daySchema.optional().nullable(),
  endYear: yearSchema.optional().nullable(),
  endMonth: monthSchema.optional().nullable(),
  endDay: daySchema.optional().nullable()
});

/** Inline place payload when creating/updating an event (alternative to linking `placeId`). */
export const placeInputSchema = z.object({
  name: z.string().min(1),
  addressLine1: z.string().optional().nullable(),
  locality: z.string().optional().nullable(),
  adminArea: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  countryCode: z.string().max(2).optional().nullable(),
  latitude: z.number().finite().optional().nullable(),
  longitude: z.number().finite().optional().nullable(),
  notes: z.string().optional().nullable()
});

/** Source citation attached to a life event (inline fields and/or existing shared `sourceId`). */
export const lifeEventCitationInputSchema = z
  .object({
    sourceId: z.string().min(1).optional().nullable(),
    title: z.string().optional().nullable(),
    repository: z.string().optional().nullable(),
    url: z.string().optional().nullable(),
    page: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    citedAt: z.string().optional().nullable()
  })
  .superRefine((c, ctx) => {
    if (c.sourceId?.trim()) {
      return;
    }
    const has =
      (c.title?.trim() ?? "") ||
      (c.repository?.trim() ?? "") ||
      (c.url?.trim() ?? "") ||
      (c.page?.trim() ?? "") ||
      (c.notes?.trim() ?? "") ||
      (c.citedAt?.trim() ?? "");
    if (!has) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Each citation needs sourceId or at least one of title, repository, url, page, notes, citedAt"
      });
    }
  });

/** `POST` life-event body: type, optional partial dates, place or placeId, notes, citations. */
export const createLifeEventBodySchema = z
  .object({
    eventType: lifeEventTypeSchema,
    dateQualifier: dateQualifierSchema.optional(),
    year: yearSchema.optional().nullable(),
    month: monthSchema.optional().nullable(),
    day: daySchema.optional().nullable(),
    endYear: yearSchema.optional().nullable(),
    endMonth: monthSchema.optional().nullable(),
    endDay: daySchema.optional().nullable(),
    placeId: z.string().min(1).optional().nullable(),
    place: placeInputSchema.optional().nullable(),
    notes: z.string().optional().nullable(),
    customLabel: z.union([z.string().max(200), z.null()]).optional(),
    citations: z.array(lifeEventCitationInputSchema).optional()
  })
  .superRefine((body, ctx) => {
    if (body.placeId && body.place) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide only one of placeId or place" });
    }
    const q = body.dateQualifier ?? "EXACT";
    if (q === "BETWEEN") {
      if (body.endYear == null && body.endMonth == null && body.endDay == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "BETWEEN qualifier requires endYear, endMonth, or endDay"
        });
      }
    }
    if (body.eventType === "CUSTOM") {
      const label =
        body.customLabel === undefined || body.customLabel === null ? "" : body.customLabel.trim();
      if (!label) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CUSTOM events require a non-empty customLabel.",
          path: ["customLabel"]
        });
      }
    }
  });

/** Event types allowed on `POST /families/:id/life-events` (household / group sheet). */
export const familyAttachableLifeEventTypeValues = ["RESIDENCE", "CENSUS", "CUSTOM"] as const;
export type FamilyAttachableLifeEventTypeValue = (typeof familyAttachableLifeEventTypeValues)[number];
const familyAttachableLifeEventTypeSet = new Set<string>(familyAttachableLifeEventTypeValues);

/** Same shape as {@link createLifeEventBodySchema} but restricted to {@link familyAttachableLifeEventTypeValues}. */
export const createFamilyLifeEventBodySchema = createLifeEventBodySchema.superRefine((body, ctx) => {
  if (!familyAttachableLifeEventTypeSet.has(body.eventType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Only ${familyAttachableLifeEventTypeValues.join(", ")} events can be attached to a family`
    });
  }
});

export type CreateFamilyLifeEventBody = z.infer<typeof createFamilyLifeEventBodySchema>;

/** `PATCH` life-event body: all fields optional; same place rules as create. */
export const patchLifeEventBodySchema = z
  .object({
    eventType: lifeEventTypeSchema.optional(),
    dateQualifier: dateQualifierSchema.optional().nullable(),
    year: yearSchema.optional().nullable(),
    month: monthSchema.optional().nullable(),
    day: daySchema.optional().nullable(),
    endYear: yearSchema.optional().nullable(),
    endMonth: monthSchema.optional().nullable(),
    endDay: daySchema.optional().nullable(),
    placeId: z.string().min(1).optional().nullable(),
    place: placeInputSchema.optional().nullable(),
    notes: z.string().optional().nullable(),
    customLabel: z.union([z.string().max(200), z.null()]).optional(),
    citations: z.array(lifeEventCitationInputSchema).optional()
  })
  .superRefine((body, ctx) => {
    if (body.placeId && body.place) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide only one of placeId or place" });
    }
    if (
      body.customLabel !== undefined &&
      body.customLabel !== null &&
      typeof body.customLabel === "string" &&
      body.customLabel.trim() === ""
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "customLabel cannot be empty when provided.",
        path: ["customLabel"]
      });
    }
  });

export type PlaceInput = z.infer<typeof placeInputSchema>;
export type CreateLifeEventBody = z.infer<typeof createLifeEventBodySchema>;
export type PatchLifeEventBody = z.infer<typeof patchLifeEventBodySchema>;

/** Resolved place row returned with a life event. */
export type LifeEventPlaceRecord = PlaceInput & {
  id: string;
};

/** Citation row as returned from the API (flattened for editors; `source` when loaded). */
export type LifeEventCitationRecord = z.infer<typeof lifeEventCitationInputSchema> & {
  id: string;
  source?: {
    id: string;
    title: string;
    repositoryId: string | null;
    repository: { id: string; name: string } | null;
  };
};

/** Full life-event row including place and citations. */
export type LifeEventRecord = {
  id: string;
  eventType: LifeEventTypeValue;
  customLabel: string | null;
  dateQualifier: DateQualifierValue;
  year: number | null;
  month: number | null;
  day: number | null;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
  notes: string | null;
  place: LifeEventPlaceRecord | null;
  citations: LifeEventCitationRecord[];
  createdAt: string;
  updatedAt: string;
  /** Present when the event is scoped to a family union (`Family` row). */
  familyId?: string | null;
};

/** Standard list wrapper for life-event collections. */
export type LifeEventListResponse = {
  lifeEvents: LifeEventRecord[];
};
