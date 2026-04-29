import { z } from "zod";

export const personDuplicateCandidateStatusValues = ["PENDING", "DISMISSED", "MERGED"] as const;
export type PersonDuplicateCandidateStatus = (typeof personDuplicateCandidateStatusValues)[number];
export const personDuplicateCandidateStatusSchema = z.enum(personDuplicateCandidateStatusValues);

export const personDuplicateReasonCodeValues = [
  "name",
  "vital",
  "family",
  "cooccurrence",
  "externalIdentity",
  "review"
] as const;
export type PersonDuplicateReasonCode = (typeof personDuplicateReasonCodeValues)[number];
export const personDuplicateReasonCodeSchema = z.enum(personDuplicateReasonCodeValues);

export const personDuplicateReasonSchema = z.object({
  code: personDuplicateReasonCodeSchema,
  label: z.string().min(1),
  detail: z.string().min(1).optional(),
  weight: z.number().min(0)
});

export const personDuplicateListQuerySchema = z.object({
  status: personDuplicateCandidateStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const patchPersonDuplicateCandidateBodySchema = z.object({
  status: z.enum(["PENDING", "DISMISSED"])
});

export const mergePeopleBodySchema = z
  .object({
    canonicalPersonId: z.string().trim().min(1),
    duplicatePersonId: z.string().trim().min(1),
    confirm: z.literal(true)
  })
  .refine((body) => body.canonicalPersonId !== body.duplicatePersonId, {
    message: "canonicalPersonId and duplicatePersonId must differ",
    path: ["duplicatePersonId"]
  });

export type PersonDuplicateReason = z.infer<typeof personDuplicateReasonSchema>;
export type PersonDuplicateListQuery = z.infer<typeof personDuplicateListQuerySchema>;
export type PatchPersonDuplicateCandidateBody = z.infer<typeof patchPersonDuplicateCandidateBodySchema>;
export type MergePeopleBody = z.infer<typeof mergePeopleBodySchema>;

export type PersonDuplicateSummary = {
  id: string;
  label: string;
  givenName: string | null;
  surname: string | null;
  birthDate: string | null;
  deathDate: string | null;
  externalIdentityCount: number;
};

export type PersonDuplicateCandidateRecord = {
  id: string;
  personAId: string;
  personBId: string;
  score: number;
  reasons: PersonDuplicateReason[];
  status: PersonDuplicateCandidateStatus;
  dismissedAt: string | null;
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
  personA: PersonDuplicateSummary;
  personB: PersonDuplicateSummary;
};

export type PersonDuplicateRecomputeResponse = {
  candidates: PersonDuplicateCandidateRecord[];
  summary: {
    created: number;
    updated: number;
    preservedDismissed: number;
    pending: number;
  };
};

export type PersonMergeResult = {
  candidate: PersonDuplicateCandidateRecord;
  auditId: string;
  canonicalPersonId: string;
  duplicatePersonId: string;
  changedCounts: Record<string, number>;
  warnings: string[];
};
