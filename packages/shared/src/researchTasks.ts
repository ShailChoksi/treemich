/**
 * @packageDocumentation
 * Research task status values, query schema, and Zod DTOs for Treemich genealogy to-do items.
 */

import { z } from "zod";

/** Kanban-style task status stored on `ResearchTask`. */
export const researchTaskStatusValues = ["OPEN", "IN_PROGRESS", "DONE"] as const;
export type ResearchTaskStatus = (typeof researchTaskStatusValues)[number];
export const researchTaskStatusSchema = z.enum(researchTaskStatusValues);

/** `POST /research/tasks` body; `personId` null/omitted means a global task. */
export const createResearchTaskBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  status: researchTaskStatusSchema.optional().default("OPEN"),
  personId: z.string().trim().min(1).nullable().optional(),
  /** @deprecated Use personId. */
  immichPersonId: z.string().trim().min(1).nullable().optional(),
  dueDate: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().min(1).max(5000).nullable().optional()
});

/** `PATCH /research/tasks/:id` body. */
export const patchResearchTaskBodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: researchTaskStatusSchema.optional(),
  personId: z.string().trim().min(1).nullable().optional(),
  /** @deprecated Use personId. */
  immichPersonId: z.string().trim().min(1).nullable().optional(),
  dueDate: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().min(1).max(5000).nullable().optional()
});

/** `GET /research/tasks` optional filter. */
export const researchTaskQuerySchema = z.object({
  personId: z.string().trim().min(1).optional()
});

export type CreateResearchTaskBody = z.infer<typeof createResearchTaskBodySchema>;
export type PatchResearchTaskBody = z.infer<typeof patchResearchTaskBodySchema>;
export type ResearchTaskQuery = z.infer<typeof researchTaskQuerySchema>;

/** Research task row as returned from list/create/patch APIs. */
export type ResearchTaskRecord = {
  id: string;
  title: string;
  status: ResearchTaskStatus;
  personId: string | null;
  /** @deprecated Use personId. */
  immichPersonId: string | null;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
