import { z } from "zod";

export const validationFindingStatusValues = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"] as const;
export type ValidationFindingStatus = (typeof validationFindingStatusValues)[number];
export const validationFindingStatusSchema = z.enum(validationFindingStatusValues);

export const validationFindingSeverityValues = ["error", "warning"] as const;
export type ValidationFindingSeverity = (typeof validationFindingSeverityValues)[number];
export const validationFindingSeveritySchema = z.enum(validationFindingSeverityValues);

export const validationFindingListQuerySchema = z.object({
  status: z.union([validationFindingStatusSchema, z.array(validationFindingStatusSchema)]).optional(),
  severity: validationFindingSeveritySchema.optional(),
  code: z.string().trim().min(1).optional(),
  personId: z.string().trim().min(1).optional(),
  familyId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const patchValidationFindingBodySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "DISMISSED"])
});

export type ValidationFindingListQuery = z.infer<typeof validationFindingListQuerySchema>;
export type PatchValidationFindingBody = z.infer<typeof patchValidationFindingBodySchema>;

export type ValidationFindingDisplayContext = {
  person?: { id: string; label: string } | null;
  relatedPerson?: { id: string; label: string } | null;
  relationship?: {
    id: string;
    label: string;
    fromPersonId: string;
    toPersonId: string;
  } | null;
  family?: { id: string; label: string } | null;
};

export type ValidationFindingRecord = {
  id: string;
  code: string;
  severity: ValidationFindingSeverity;
  message: string;
  personId: string | null;
  relationshipId: string | null;
  relatedPersonId: string | null;
  familyId: string | null;
  status: ValidationFindingStatus;
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  dismissedAt: string | null;
  inProgressAt: string | null;
  metadata: Record<string, unknown>;
  display: ValidationFindingDisplayContext;
};

export type ValidationRecomputeSummary = {
  current: number;
  created: number;
  reopened: number;
  resolved: number;
  inProgressStillPresent: number;
  dismissedStillPresent: number;
};
