import { z } from "zod";

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

export const lifeEventTypeValues = [
  "BIRTH",
  "DEATH",
  "MARRIAGE",
  "DIVORCE",
  "BURIAL",
  "CHRISTENING",
  "RESIDENCE",
  "IMMIGRATION",
  "CUSTOM"
] as const;
export type LifeEventTypeValue = (typeof lifeEventTypeValues)[number];

export const dateQualifierSchema = z.enum(dateQualifierValues);
export const lifeEventTypeSchema = z.enum(lifeEventTypeValues);

const yearSchema = z.number().int().min(1).max(9999);
const monthSchema = z.number().int().min(1).max(12);
const daySchema = z.number().int().min(1).max(31);

/** Partial date components; validated as a group by validatePartialDateTriplet. */
export const partialDatePartsSchema = z.object({
  year: yearSchema.optional().nullable(),
  month: monthSchema.optional().nullable(),
  day: daySchema.optional().nullable(),
  endYear: yearSchema.optional().nullable(),
  endMonth: monthSchema.optional().nullable(),
  endDay: daySchema.optional().nullable()
});

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

export const lifeEventCitationInputSchema = z.object({
  title: z.string().optional().nullable(),
  repository: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  page: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  citedAt: z.string().optional().nullable()
});

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
  });

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
    citations: z.array(lifeEventCitationInputSchema).optional()
  })
  .superRefine((body, ctx) => {
    if (body.placeId && body.place) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide only one of placeId or place" });
    }
  });

export type PlaceInput = z.infer<typeof placeInputSchema>;
export type CreateLifeEventBody = z.infer<typeof createLifeEventBodySchema>;
export type PatchLifeEventBody = z.infer<typeof patchLifeEventBodySchema>;

export type LifeEventPlaceRecord = PlaceInput & {
  id: string;
};

export type LifeEventCitationRecord = z.infer<typeof lifeEventCitationInputSchema> & {
  id: string;
};

export type LifeEventRecord = {
  id: string;
  eventType: LifeEventTypeValue;
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
};

export type LifeEventListResponse = {
  lifeEvents: LifeEventRecord[];
};
