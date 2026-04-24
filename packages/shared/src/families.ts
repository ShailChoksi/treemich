import { z } from "zod";

/** Pedigree for a child within a {@link FamilyRecord} (GEDCOM PEDI-style). */
export const familyChildPedigreeValues = ["BIOLOGICAL", "ADOPTED", "FOSTER", "STEP", "UNKNOWN"] as const;
export type FamilyChildPedigree = (typeof familyChildPedigreeValues)[number];

export const familyChildPedigreeSchema = z.enum(familyChildPedigreeValues);

const optionalImmichId = z.union([z.string().min(1), z.null()]).optional();

const familyChildInputSchema = z.object({
  childImmichPersonId: z.string().min(1),
  pedigree: familyChildPedigreeSchema.optional()
});

export const createFamilyBodySchema = z
  .object({
    parent1ImmichPersonId: optionalImmichId,
    parent2ImmichPersonId: optionalImmichId,
    notes: z.string().max(8000).nullable().optional(),
    children: z.array(familyChildInputSchema).optional().default([]),
    /** Optional interchange keys (e.g. `gedcomFam` from GEDCOM import). */
    externalIds: z.record(z.string(), z.unknown()).optional()
  })
  .superRefine((body, ctx) => {
    const p1 = body.parent1ImmichPersonId ?? null;
    const p2 = body.parent2ImmichPersonId ?? null;
    if (p1 && p2 && p1 === p2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "parent1ImmichPersonId and parent2ImmichPersonId must differ when both are set"
      });
    }
    const childIds = body.children.map((c) => c.childImmichPersonId);
    const dup = childIds.find((id, i) => childIds.indexOf(id) !== i);
    if (dup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate childImmichPersonId: ${dup}`
      });
    }
    for (const c of body.children) {
      if (p1 && c.childImmichPersonId === p1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A child cannot be the same person as parent1"
        });
      }
      if (p2 && c.childImmichPersonId === p2) {
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
    parent1ImmichPersonId: optionalImmichId,
    parent2ImmichPersonId: optionalImmichId,
    notes: z.string().max(8000).nullable().optional(),
    children: z.array(familyChildInputSchema).optional()
  })
  .superRefine((body, ctx) => {
    const p1 = body.parent1ImmichPersonId;
    const p2 = body.parent2ImmichPersonId;
    if (p1 !== undefined && p2 !== undefined && p1 && p2 && p1 === p2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "parent1ImmichPersonId and parent2ImmichPersonId must differ when both are set"
      });
    }
    if (body.children) {
      const childIds = body.children.map((c) => c.childImmichPersonId);
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
  childImmichPersonId: string;
  pedigree: FamilyChildPedigree;
  createdAt: string;
  updatedAt: string;
};

export type FamilyRecord = {
  id: string;
  userId: string;
  parent1ImmichPersonId: string | null;
  parent2ImmichPersonId: string | null;
  notes: string | null;
  externalIds: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  children: FamilyChildRecord[];
};
