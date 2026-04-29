import { z } from "zod";

export const createRepositoryBodySchema = z.object({
  name: z.string().min(1),
  addressLine1: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const patchRepositoryBodySchema = z.object({
  name: z.string().min(1).optional(),
  addressLine1: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const createSourceBodySchema = z.object({
  repositoryId: z.string().min(1).optional().nullable(),
  title: z.string().min(1),
  author: z.string().optional().nullable(),
  publication: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const patchSourceBodySchema = z.object({
  repositoryId: z.string().min(1).optional().nullable(),
  title: z.string().min(1).optional(),
  author: z.string().optional().nullable(),
  publication: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

export const sourceListQuerySchema = z.object({
  q: z.string().optional()
});

/** Merge duplicate bibliography rows: reassigns all citations from `fromSourceId` to `intoSourceId`, then deletes the former. */
export const mergeSourcesBodySchema = z
  .object({
    fromSourceId: z.string().min(1),
    intoSourceId: z.string().min(1)
  })
  .refine((b) => b.fromSourceId !== b.intoSourceId, {
    message: "fromSourceId and intoSourceId must differ",
    path: ["intoSourceId"]
  });

export const createMediaObjectBodySchema = z.object({
  storageUrl: z.string().min(1),
  mimeType: z.string().optional().nullable(),
  checksum: z.string().optional().nullable(),
  immichAssetId: z.string().optional().nullable(),
  title: z.string().optional().nullable()
});

export const patchMediaObjectBodySchema = z.object({
  storageUrl: z.string().min(1).optional(),
  mimeType: z.string().optional().nullable(),
  checksum: z.string().optional().nullable(),
  immichAssetId: z.string().optional().nullable(),
  title: z.string().optional().nullable()
});

export const mediaLinkTargetTypeSchema = z.enum(["PERSON_PROFILE", "LIFE_EVENT", "SOURCE", "FAMILY"]);

export const createMediaLinkBodySchema = z.object({
  targetType: mediaLinkTargetTypeSchema,
  targetId: z.string().min(1),
  notes: z.string().optional().nullable()
});

export const targetMediaLinkQuerySchema = z.object({
  targetType: mediaLinkTargetTypeSchema,
  targetId: z.string().min(1)
});

export type CreateRepositoryBody = z.infer<typeof createRepositoryBodySchema>;
export type PatchRepositoryBody = z.infer<typeof patchRepositoryBodySchema>;
export type CreateSourceBody = z.infer<typeof createSourceBodySchema>;
export type PatchSourceBody = z.infer<typeof patchSourceBodySchema>;
export type SourceListQuery = z.infer<typeof sourceListQuerySchema>;
export type MergeSourcesBody = z.infer<typeof mergeSourcesBodySchema>;
export type CreateMediaObjectBody = z.infer<typeof createMediaObjectBodySchema>;
export type PatchMediaObjectBody = z.infer<typeof patchMediaObjectBodySchema>;
export type CreateMediaLinkBody = z.infer<typeof createMediaLinkBodySchema>;
export type MediaLinkTargetType = z.infer<typeof mediaLinkTargetTypeSchema>;
export type TargetMediaLinkQuery = z.infer<typeof targetMediaLinkQuerySchema>;

export type RepositoryRecord = {
  id: string;
  name: string;
  addressLine1: string | null;
  url: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SourceRecord = {
  id: string;
  repositoryId: string | null;
  title: string;
  author: string | null;
  publication: string | null;
  url: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  repository?: RepositoryRecord | null;
};

export type MediaObjectRecord = {
  id: string;
  storageUrl: string;
  mimeType: string | null;
  checksum: string | null;
  immichAssetId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaLinkRecord = {
  id: string;
  mediaObjectId: string;
  targetType: MediaLinkTargetType;
  targetId: string;
  notes: string | null;
  createdAt: string;
};

export type TargetMediaLinkRecord = MediaLinkRecord & {
  mediaObject: MediaObjectRecord;
};
