/**
 * @packageDocumentation
 * Focus Share owner API DTOs — password-gated public links to a live Focus-mode cone.
 */

import { z } from "zod";

/** Provisional public path prefix; exact URL shape may still be refined. */
export const focusSharePublicPathPrefix = "/share";

/** Keep in sync with `minFocusBloodlineDepth` / `maxFocusBloodlineDepth` in index.ts. */
const minBloodlineDepth = 0;
const maxBloodlineDepth = 20;
/** Keep in sync with `minFocusCollateralDepth` / `maxFocusCollateralDepth` in index.ts. */
const minCollateralDepth = 0;
const maxCollateralDepth = 5;

const focusShareLabelSchema = z.string().trim().max(200).nullable();

const maxAncestorDepthSchema = z.number().int().min(minBloodlineDepth).max(maxBloodlineDepth);
const maxDescendantDepthSchema = z.number().int().min(minBloodlineDepth).max(maxBloodlineDepth);
const maxCollateralDepthSchema = z.number().int().min(minCollateralDepth).max(maxCollateralDepth);

/** `POST /focus-shares` body — capture current Focus Anchor + max depths + password. */
export const createFocusShareBodySchema = z.object({
  password: z.string().min(8).max(200),
  label: focusShareLabelSchema.optional(),
  focusAnchorPersonId: z.string().trim().min(1),
  maxAncestorDepth: maxAncestorDepthSchema,
  maxDescendantDepth: maxDescendantDepthSchema,
  maxCollateralDepth: maxCollateralDepthSchema
});

/** `PATCH /focus-shares/:shareId` body. */
export const patchFocusShareBodySchema = z
  .object({
    label: focusShareLabelSchema.optional(),
    focusAnchorPersonId: z.string().trim().min(1).optional(),
    maxAncestorDepth: maxAncestorDepthSchema.optional(),
    maxDescendantDepth: maxDescendantDepthSchema.optional(),
    maxCollateralDepth: maxCollateralDepthSchema.optional()
  })
  .refine(
    (body) =>
      body.label !== undefined ||
      body.focusAnchorPersonId !== undefined ||
      body.maxAncestorDepth !== undefined ||
      body.maxDescendantDepth !== undefined ||
      body.maxCollateralDepth !== undefined,
    { message: "At least one field is required" }
  );

/** `POST /focus-shares/:shareId/rotate-password` body. */
export const rotateFocusSharePasswordBodySchema = z.object({
  password: z.string().min(8).max(200)
});

/** `POST /share/:publicId/unlock` body. */
export const unlockFocusShareBodySchema = z.object({
  password: z.string().min(1).max(200)
});

export type CreateFocusShareBody = z.infer<typeof createFocusShareBodySchema>;
export type PatchFocusShareBody = z.infer<typeof patchFocusShareBodySchema>;
export type RotateFocusSharePasswordBody = z.infer<typeof rotateFocusSharePasswordBodySchema>;
export type UnlockFocusShareBody = z.infer<typeof unlockFocusShareBodySchema>;

/** Public cone caps returned after a successful guest unlock (no secrets). */
export type FocusShareGuestView = {
  publicId: string;
  label: string | null;
  focusAnchorPersonId: string;
  maxAncestorDepth: number;
  maxDescendantDepth: number;
  maxCollateralDepth: number;
};

/** `POST /share/:publicId/unlock` success body. */
export type FocusShareGuestUnlockResponse = {
  share: FocusShareGuestView;
  expiresAt: string;
};

/** Person row for the guest graph (display fields only). */
export type FocusShareGuestPerson = {
  id: string;
  name: string;
  givenName: string | null;
  surname: string | null;
  /**
   * True when the guest thumbnail route can serve an image
   * (stored Treemich thumb and/or linked Immich identity).
   */
  hasThumbnail: boolean;
  /** True when the person has an Immich external identity (for guest people filters). */
  hasImmichLink: boolean;
  /**
   * Birth date from the person's BIRTH life event when present.
   * Partial dates: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`.
   */
  birthDate: string | null;
  /**
   * Death date from the person's DEATH life event when present.
   * Partial dates: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`.
   */
  deathDate: string | null;
};

/** Relationship edge inside the guest Focus cone. */
export type FocusShareGuestRelationship = {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  type: string;
};

/**
 * Owner layout prefs needed so the guest cone positions/trunks match the owner's Focus view.
 * Scoped to membership person ids only.
 */
export type FocusShareGuestGraphLayout = {
  primaryFamilyUnitByPersonId: Record<string, string>;
  treeLayoutPreferences: {
    horizontalSpacing?: number;
    verticalSpacing?: number;
    spouseBranchZDistance?: number;
    spouseBranchSensitivity?: number;
  };
};

/** `GET /share/guest/graph` response. */
export type FocusShareGuestGraphResponse = {
  share: FocusShareGuestView;
  depths: {
    ancestorDepth: number;
    descendantDepth: number;
    collateralDepth: number;
  };
  people: FocusShareGuestPerson[];
  relationships: FocusShareGuestRelationship[];
  layout: FocusShareGuestGraphLayout;
};

/** Query depths for guest graph; omitted values default to the share maxes. */
export const guestFocusShareGraphQuerySchema = z.object({
  ancestorDepth: z.coerce.number().int().optional(),
  descendantDepth: z.coerce.number().int().optional(),
  collateralDepth: z.coerce.number().int().optional()
});

export type GuestFocusShareGraphQuery = z.infer<typeof guestFocusShareGraphQuerySchema>;

/** Owner-facing Focus Share row (never includes password hash). */
export type FocusShareRecord = {
  id: string;
  publicId: string;
  /** Path segment for the public viewer, e.g. `/share/{publicId}`. */
  publicPath: string;
  label: string | null;
  focusAnchorPersonId: string;
  maxAncestorDepth: number;
  maxDescendantDepth: number;
  maxCollateralDepth: number;
  createdAt: string;
  updatedAt: string;
};

export const buildFocusSharePublicPath = (publicId: string) =>
  `${focusSharePublicPathPrefix}/${encodeURIComponent(publicId)}`;
