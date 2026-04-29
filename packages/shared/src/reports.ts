import { z } from "zod";
import { dateQualifierSchema, lifeEventTypeSchema } from "./lifeEvents.js";
import { familyChildPedigreeSchema } from "./families.js";

const reportGenderSchema = z.enum(["MALE", "FEMALE", "OTHER", "UNKNOWN"]);

export const reportTypeValues = ["pedigree", "descendants", "family-group", "register"] as const;
export type ReportType = (typeof reportTypeValues)[number];

export const reportWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  personId: z.string().min(1).optional(),
  familyId: z.string().min(1).optional()
});
export type ReportWarning = z.infer<typeof reportWarningSchema>;

export const reportCitationSummarySchema = z.object({
  id: z.string().min(1),
  sourceTitle: z.string().min(1),
  repositoryName: z.string().nullable(),
  page: z.string().nullable(),
  notes: z.string().nullable()
});
export type ReportCitationSummary = z.infer<typeof reportCitationSummarySchema>;

export const reportLifeEventSummarySchema = z.object({
  id: z.string().min(1),
  type: lifeEventTypeSchema,
  label: z.string().min(1),
  dateQualifier: dateQualifierSchema,
  year: z.number().int().nullable(),
  month: z.number().int().nullable(),
  day: z.number().int().nullable(),
  endYear: z.number().int().nullable(),
  endMonth: z.number().int().nullable(),
  endDay: z.number().int().nullable(),
  dateDisplay: z.string().nullable(),
  placeDisplay: z.string().nullable(),
  notes: z.string().nullable(),
  citations: z.array(reportCitationSummarySchema)
});
export type ReportLifeEventSummary = z.infer<typeof reportLifeEventSummarySchema>;

export const reportPersonSummarySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  gender: reportGenderSchema,
  primaryName: z.string().nullable(),
  alternateNames: z.array(z.string()),
  isLiving: z.boolean(),
  isRedacted: z.boolean(),
  events: z.array(reportLifeEventSummarySchema)
});
export type ReportPersonSummary = z.infer<typeof reportPersonSummarySchema>;

export const reportBaseParametersSchema = z.object({
  redactLiving: z.boolean().default(false)
});

export const depthReportParametersSchema = reportBaseParametersSchema.extend({
  rootPersonId: z.string().min(1),
  depth: z.number().int().min(1)
});

export const pedigreeReportRequestSchema = depthReportParametersSchema;
export type PedigreeReportRequest = z.infer<typeof pedigreeReportRequestSchema>;

export const descendantReportRequestSchema = depthReportParametersSchema;
export type DescendantReportRequest = z.infer<typeof descendantReportRequestSchema>;

export const registerReportRequestSchema = depthReportParametersSchema;
export type RegisterReportRequest = z.infer<typeof registerReportRequestSchema>;

export const familyGroupSheetRequestSchema = reportBaseParametersSchema.extend({
  familyId: z.string().min(1)
});
export type FamilyGroupSheetRequest = z.infer<typeof familyGroupSheetRequestSchema>;

const reportMetadataSchema = z.object({
  generatedAt: z.string().datetime(),
  warnings: z.array(reportWarningSchema)
});

export const pedigreeEdgeSchema = z.object({
  childPersonId: z.string().min(1),
  parentPersonId: z.string().min(1),
  familyId: z.string().min(1).nullable()
});
export type PedigreeEdge = z.infer<typeof pedigreeEdgeSchema>;

export const pedigreeReportResponseSchema = reportMetadataSchema.extend({
  type: z.literal("pedigree"),
  parameters: pedigreeReportRequestSchema,
  root: reportPersonSummarySchema,
  generations: z.array(
    z.object({
      generation: z.number().int().min(0),
      people: z.array(reportPersonSummarySchema)
    })
  ),
  edges: z.array(pedigreeEdgeSchema)
});
export type PedigreeReportResponse = z.infer<typeof pedigreeReportResponseSchema>;

export const descendantFamilyGroupSchema = z.object({
  familyId: z.string().min(1).nullable(),
  parents: z.array(reportPersonSummarySchema),
  children: z.array(
    z.object({
      person: reportPersonSummarySchema,
      pedigree: familyChildPedigreeSchema.nullable()
    })
  )
});
export type DescendantFamilyGroup = z.infer<typeof descendantFamilyGroupSchema>;

export const descendantReportResponseSchema = reportMetadataSchema.extend({
  type: z.literal("descendants"),
  parameters: descendantReportRequestSchema,
  root: reportPersonSummarySchema,
  generations: z.array(
    z.object({
      generation: z.number().int().min(0),
      families: z.array(descendantFamilyGroupSchema)
    })
  )
});
export type DescendantReportResponse = z.infer<typeof descendantReportResponseSchema>;

export const familyGroupSheetResponseSchema = reportMetadataSchema.extend({
  type: z.literal("family-group"),
  parameters: familyGroupSheetRequestSchema,
  family: z.object({
    id: z.string().min(1),
    notes: z.string().nullable(),
    parents: z.array(reportPersonSummarySchema),
    children: z.array(
      z.object({
        person: reportPersonSummarySchema,
        pedigree: familyChildPedigreeSchema.nullable()
      })
    ),
    events: z.array(reportLifeEventSummarySchema),
    citations: z.array(reportCitationSummarySchema)
  })
});
export type FamilyGroupSheetResponse = z.infer<typeof familyGroupSheetResponseSchema>;

export const registerNarrativeSectionSchema = z.object({
  number: z.number().int().min(1),
  generation: z.number().int().min(0),
  person: reportPersonSummarySchema,
  familySummaries: z.array(z.string()),
  prose: z.array(z.string()),
  citations: z.array(reportCitationSummarySchema)
});
export type RegisterNarrativeSection = z.infer<typeof registerNarrativeSectionSchema>;

export const registerReportResponseSchema = reportMetadataSchema.extend({
  type: z.literal("register"),
  parameters: registerReportRequestSchema,
  root: reportPersonSummarySchema,
  sections: z.array(registerNarrativeSectionSchema)
});
export type RegisterReportResponse = z.infer<typeof registerReportResponseSchema>;

export const reportResponseSchema = z.discriminatedUnion("type", [
  pedigreeReportResponseSchema,
  descendantReportResponseSchema,
  familyGroupSheetResponseSchema,
  registerReportResponseSchema
]);
export type ReportResponse = z.infer<typeof reportResponseSchema>;
