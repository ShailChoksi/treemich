import { z } from "zod";

/** Pedigree for a child within a {@link FamilyRecord} (GEDCOM PEDI-style). */
export const familyChildPedigreeValues = ["BIOLOGICAL", "ADOPTED", "FOSTER", "STEP", "UNKNOWN"] as const;
export type FamilyChildPedigree = (typeof familyChildPedigreeValues)[number];

export const familyChildPedigreeSchema = z.enum(familyChildPedigreeValues);

const optionalPersonId = z.union([z.string().min(1), z.null()]).optional();

const familyChildInputSchema = z
  .object({
    childPersonId: z.string().min(1).optional(),
    /** @deprecated Use childPersonId. */
    childImmichPersonId: z.string().min(1).optional(),
    pedigree: familyChildPedigreeSchema.optional()
  })
  .refine((child) => child.childPersonId || child.childImmichPersonId, {
    message: "childPersonId is required"
  });

export const createFamilyBodySchema = z
  .object({
    parent1PersonId: optionalPersonId,
    parent2PersonId: optionalPersonId,
    /** @deprecated Use parent1PersonId. */
    parent1ImmichPersonId: optionalPersonId,
    /** @deprecated Use parent2PersonId. */
    parent2ImmichPersonId: optionalPersonId,
    notes: z.string().max(8000).nullable().optional(),
    children: z.array(familyChildInputSchema).optional().default([]),
    /** Optional interchange keys (e.g. `gedcomFam` from GEDCOM import). */
    externalIds: z.record(z.string(), z.unknown()).optional()
  })
  .superRefine((body, ctx) => {
    const p1 = body.parent1PersonId ?? body.parent1ImmichPersonId ?? null;
    const p2 = body.parent2PersonId ?? body.parent2ImmichPersonId ?? null;
    if (p1 && p2 && p1 === p2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "parent1ImmichPersonId and parent2ImmichPersonId must differ when both are set"
      });
    }
    const childIds = body.children.map((c) => c.childPersonId ?? c.childImmichPersonId);
    const dup = childIds.find((id, i) => childIds.indexOf(id) !== i);
    if (dup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate childImmichPersonId: ${dup}`
      });
    }
    for (const c of body.children) {
      const childId = c.childPersonId ?? c.childImmichPersonId;
      if (p1 && childId === p1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A child cannot be the same person as parent1"
        });
      }
      if (p2 && childId === p2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A child cannot be the same person as parent2"
        });
      }
    }
    if (!p1 && !p2 && body.children.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Family must include at least one parent or one child"
      });
    }
  });

export type CreateFamilyBody = z.infer<typeof createFamilyBodySchema>;

export const patchFamilyBodySchema = z
  .object({
    parent1PersonId: optionalPersonId,
    parent2PersonId: optionalPersonId,
    /** @deprecated Use parent1PersonId. */
    parent1ImmichPersonId: optionalPersonId,
    /** @deprecated Use parent2PersonId. */
    parent2ImmichPersonId: optionalPersonId,
    notes: z.string().max(8000).nullable().optional(),
    children: z.array(familyChildInputSchema).optional()
  })
  .superRefine((body, ctx) => {
    const p1 = body.parent1PersonId ?? body.parent1ImmichPersonId;
    const p2 = body.parent2PersonId ?? body.parent2ImmichPersonId;
    if (p1 !== undefined && p2 !== undefined && p1 && p2 && p1 === p2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "parent1ImmichPersonId and parent2ImmichPersonId must differ when both are set"
      });
    }
    if (body.children) {
      const childIds = body.children.map((c) => c.childPersonId ?? c.childImmichPersonId);
      const dup = childIds.find((id, i) => childIds.indexOf(id) !== i);
      if (dup) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate childImmichPersonId: ${dup}`
        });
      }
    }
  });

export type PatchFamilyBody = z.infer<typeof patchFamilyBodySchema>;

/** API shape for a family row including children. */
export type FamilyChildRecord = {
  id: string;
  childPersonId: string | null;
  /** @deprecated Use childPersonId. */
  childImmichPersonId: string | null;
  pedigree: FamilyChildPedigree;
  createdAt: string;
  updatedAt: string;
};

export type FamilyRecord = {
  id: string;
  userId: string;
  parent1PersonId: string | null;
  parent2PersonId: string | null;
  /** @deprecated Use parent1PersonId. */
  parent1ImmichPersonId: string | null;
  /** @deprecated Use parent2PersonId. */
  parent2ImmichPersonId: string | null;
  notes: string | null;
  externalIds: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  children: FamilyChildRecord[];
};
