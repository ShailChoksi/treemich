/**
 * @file Owner Focus Share persistence — create/list/patch/rotate/revoke.
 */

import type {
  CreateFocusShareBody,
  FocusShareGuestGraphResponse,
  FocusShareGuestUnlockResponse,
  FocusShareGuestView,
  FocusShareRecord,
  GuestFocusShareGraphQuery,
  PatchFocusShareBody
} from "@treemich/shared";
import { buildFocusSharePublicPath, pickFocusMembershipIds } from "@treemich/shared";
import { TreemichAuthError } from "../auth/service.js";
import { createOpaqueToken, hashPassword, hashToken, verifyPassword } from "../auth/crypto.js";
import { env } from "../config/env.js";
import { prisma } from "../db/client.js";
import { HttpNotFoundError, HttpValidationError } from "../lifeEvents/errors.js";
import type { ProfileResolver } from "../people/profileResolver.js";
import { PersonService } from "../people/service.js";
import { resolveDisplayNameForPerson } from "../personNames/service.js";
import { parseUserPreferences } from "../preferences.js";

export type FocusShareGuestSessionContext = {
  session: {
    id: string;
    focusShareId: string;
    expiresAt: Date;
  };
  share: FocusShareGuestView & {
    id: string;
    userId: string;
  };
};

/** Serialize a BIRTH/DEATH life-event date for the guest graph (`YYYY` / `YYYY-MM` / `YYYY-MM-DD`). */
const vitalDateValue = (
  event:
    | {
        year: number | null;
        month: number | null;
        day: number | null;
      }
    | null
    | undefined
): string | null => {
  if (event?.year == null) {
    return null;
  }
  const month = event.month == null ? "" : `-${String(event.month).padStart(2, "0")}`;
  const day = event.day == null ? "" : `-${String(event.day).padStart(2, "0")}`;
  return `${String(event.year).padStart(4, "0")}${month}${day}`;
};

const toRecord = (row: {
  id: string;
  publicId: string;
  label: string | null;
  focusAnchorPersonId: string;
  maxAncestorDepth: number;
  maxDescendantDepth: number;
  maxCollateralDepth: number;
  createdAt: Date;
  updatedAt: Date;
}): FocusShareRecord => ({
  id: row.id,
  publicId: row.publicId,
  publicPath: buildFocusSharePublicPath(row.publicId),
  label: row.label,
  focusAnchorPersonId: row.focusAnchorPersonId,
  maxAncestorDepth: row.maxAncestorDepth,
  maxDescendantDepth: row.maxDescendantDepth,
  maxCollateralDepth: row.maxCollateralDepth,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

export class FocusShareService {
  constructor(private readonly profileResolver: ProfileResolver = new PersonService()) {}

  async list(userId: string): Promise<FocusShareRecord[]> {
    const rows = await prisma.focusShare.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });
    return rows.map(toRecord);
  }

  async create(userId: string, body: CreateFocusShareBody): Promise<FocusShareRecord> {
    const focusAnchorPersonId = await this.profileResolver.resolveProfile(userId, body.focusAnchorPersonId);
    const created = await prisma.focusShare.create({
      data: {
        userId,
        publicId: createOpaqueToken(),
        passwordHash: hashPassword(body.password),
        label: body.label === undefined ? null : body.label,
        focusAnchorPersonId,
        maxAncestorDepth: body.maxAncestorDepth,
        maxDescendantDepth: body.maxDescendantDepth,
        maxCollateralDepth: body.maxCollateralDepth
      }
    });
    return toRecord(created);
  }

  async update(userId: string, shareId: string, body: PatchFocusShareBody): Promise<FocusShareRecord> {
    await this.requireOwnedShare(userId, shareId);
    const focusAnchorPersonId =
      body.focusAnchorPersonId !== undefined
        ? await this.profileResolver.resolveProfile(userId, body.focusAnchorPersonId)
        : undefined;
    if (
      body.label === undefined &&
      focusAnchorPersonId === undefined &&
      body.maxAncestorDepth === undefined &&
      body.maxDescendantDepth === undefined &&
      body.maxCollateralDepth === undefined
    ) {
      throw new HttpValidationError("At least one field is required");
    }
    const updated = await prisma.focusShare.update({
      where: { id: shareId },
      data: {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(focusAnchorPersonId !== undefined ? { focusAnchorPersonId } : {}),
        ...(body.maxAncestorDepth !== undefined ? { maxAncestorDepth: body.maxAncestorDepth } : {}),
        ...(body.maxDescendantDepth !== undefined ? { maxDescendantDepth: body.maxDescendantDepth } : {}),
        ...(body.maxCollateralDepth !== undefined ? { maxCollateralDepth: body.maxCollateralDepth } : {})
      }
    });
    return toRecord(updated);
  }

  async rotatePassword(userId: string, shareId: string, password: string): Promise<FocusShareRecord> {
    await this.requireOwnedShare(userId, shareId);
    const [updated] = await prisma.$transaction([
      prisma.focusShare.update({
        where: { id: shareId },
        data: { passwordHash: hashPassword(password) }
      }),
      prisma.focusShareGuestSession.deleteMany({ where: { focusShareId: shareId } })
    ]);
    return toRecord(updated);
  }

  async revoke(userId: string, shareId: string): Promise<void> {
    await this.requireOwnedShare(userId, shareId);
    await prisma.focusShare.delete({ where: { id: shareId } });
  }

  async unlock(
    publicId: string,
    password: string
  ): Promise<{ sessionToken: string; response: FocusShareGuestUnlockResponse }> {
    const share = await prisma.focusShare.findUnique({ where: { publicId } });
    if (!share) {
      throw new HttpNotFoundError("Focus share not found");
    }
    if (!verifyPassword(password, share.passwordHash)) {
      throw new TreemichAuthError("Invalid share password");
    }

    const sessionToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + env.TREEMICH_SHARE_SESSION_TTL_MS);
    await prisma.focusShareGuestSession.create({
      data: {
        focusShareId: share.id,
        tokenHash: hashToken(sessionToken),
        expiresAt
      }
    });

    return {
      sessionToken,
      response: {
        share: toGuestView(share),
        expiresAt: expiresAt.toISOString()
      }
    };
  }

  /**
   * Fail-closed: person must be in live Focus membership at the share's **max** depths.
   * Returns 404 for unknown/out-of-cone people (no existence oracle).
   */
  async requireGuestPersonInMembership(sessionToken: string | null, personId: string) {
    const guest = await this.requireGuestSession(sessionToken);
    const relationships = await prisma.relationship.findMany({
      where: { userId: guest.share.userId },
      select: {
        fromPersonId: true,
        toPersonId: true,
        type: true
      }
    });
    const membershipIds = pickFocusMembershipIds(relationships, {
      anchorId: guest.share.focusAnchorPersonId,
      ancestorDepth: guest.share.maxAncestorDepth,
      descendantDepth: guest.share.maxDescendantDepth,
      collateralDepth: guest.share.maxCollateralDepth
    });
    if (!membershipIds.has(personId)) {
      throw new HttpNotFoundError("Person not found");
    }
    const person = await prisma.personProfile.findFirst({
      where: { id: personId, userId: guest.share.userId },
      include: {
        externalIdentities: true,
        thumbnails: { orderBy: { updatedAt: "desc" }, take: 1 }
      }
    });
    if (!person) {
      throw new HttpNotFoundError("Person not found");
    }
    return { guest, person };
  }

  async getGuestGraph(
    sessionToken: string | null,
    query: GuestFocusShareGraphQuery
  ): Promise<FocusShareGuestGraphResponse> {
    const guest = await this.requireGuestSession(sessionToken);
    const ancestorDepth = clampDepth(
      query.ancestorDepth ?? guest.share.maxAncestorDepth,
      0,
      guest.share.maxAncestorDepth
    );
    const descendantDepth = clampDepth(
      query.descendantDepth ?? guest.share.maxDescendantDepth,
      0,
      guest.share.maxDescendantDepth
    );
    const collateralDepth = clampDepth(
      query.collateralDepth ?? guest.share.maxCollateralDepth,
      0,
      guest.share.maxCollateralDepth
    );

    const relationships = await prisma.relationship.findMany({
      where: { userId: guest.share.userId },
      select: {
        id: true,
        fromPersonId: true,
        toPersonId: true,
        type: true
      }
    });

    const membershipIds = pickFocusMembershipIds(relationships, {
      anchorId: guest.share.focusAnchorPersonId,
      ancestorDepth,
      descendantDepth,
      collateralDepth
    });

    const membershipRelationships = relationships.filter(
      (edge) => membershipIds.has(edge.fromPersonId) && membershipIds.has(edge.toPersonId)
    );

    const peopleRows =
      membershipIds.size === 0
        ? []
        : await prisma.personProfile.findMany({
            where: {
              userId: guest.share.userId,
              id: { in: [...membershipIds] }
            },
            select: {
              id: true,
              givenName: true,
              surname: true,
              displayNameOverride: true,
              thumbnails: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: { id: true, storageUrl: true }
              },
              externalIdentities: {
                where: { provider: "IMMICH" },
                take: 1,
                select: { displayName: true, providerPersonId: true }
              },
              personNames: {
                where: { isPrimary: true },
                take: 1,
                select: {
                  prefix: true,
                  givenName: true,
                  surname: true,
                  suffix: true
                }
              },
              lifeEvents: {
                where: { eventType: { in: ["BIRTH", "DEATH"] } },
                select: {
                  eventType: true,
                  year: true,
                  month: true,
                  day: true
                }
              }
            }
          });

    const people = peopleRows.map((person) => {
      const immichIdentity = person.externalIdentities[0] ?? null;
      const primaryName = person.personNames[0] ?? null;
      const profileFallback =
        [person.givenName, person.surname].filter(Boolean).join(" ").trim() ||
        `Person ${person.id.slice(0, 8)}`;
      const immichName = immichIdentity?.displayName?.trim() || profileFallback;
      const name = resolveDisplayNameForPerson({
        immichName,
        displayNameOverride: person.displayNameOverride,
        givenName: person.givenName,
        surname: person.surname,
        // Guest query selects name parts only; resolver only reads prefix/given/surname/suffix.
        primaryName: primaryName as Parameters<typeof resolveDisplayNameForPerson>[0]["primaryName"]
      });
      const thumbnail = person.thumbnails[0];
      const hasImmichLink = Boolean(immichIdentity?.providerPersonId);
      const birthEvent = person.lifeEvents.find((event) => event.eventType === "BIRTH") ?? null;
      const deathEvent = person.lifeEvents.find((event) => event.eventType === "DEATH") ?? null;
      return {
        id: person.id,
        name,
        givenName: person.givenName,
        surname: person.surname,
        hasThumbnail: Boolean(thumbnail?.storageUrl) || hasImmichLink,
        hasImmichLink,
        birthDate: vitalDateValue(birthEvent),
        deathDate: vitalDateValue(deathEvent)
      };
    });

    // Owner primary-family / spacing prefs — without these, multi-parent trees diverge from Focus view.
    const owner = await prisma.treemichUser.findUnique({
      where: { id: guest.share.userId },
      select: { preferences: true }
    });
    const ownerPreferences = parseUserPreferences(owner?.preferences);
    const primaryFamilyUnitByPersonId = Object.fromEntries(
      Object.entries(ownerPreferences.primaryFamilyUnitByPersonId ?? {}).filter(([personId]) =>
        membershipIds.has(personId)
      )
    );

    return {
      share: {
        publicId: guest.share.publicId,
        label: guest.share.label,
        focusAnchorPersonId: guest.share.focusAnchorPersonId,
        maxAncestorDepth: guest.share.maxAncestorDepth,
        maxDescendantDepth: guest.share.maxDescendantDepth,
        maxCollateralDepth: guest.share.maxCollateralDepth
      },
      depths: { ancestorDepth, descendantDepth, collateralDepth },
      people,
      relationships: membershipRelationships.map((edge) => ({
        id: edge.id,
        fromPersonId: edge.fromPersonId,
        toPersonId: edge.toPersonId,
        type: edge.type
      })),
      layout: {
        primaryFamilyUnitByPersonId,
        treeLayoutPreferences: ownerPreferences.treeLayoutPreferences ?? {}
      }
    };
  }

  async requireGuestSession(sessionToken: string | null): Promise<FocusShareGuestSessionContext> {
    if (!sessionToken) {
      throw new TreemichAuthError("Unauthorized");
    }
    const session = await prisma.focusShareGuestSession.findUnique({
      where: { tokenHash: hashToken(sessionToken) },
      include: {
        focusShare: true
      }
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      if (session) {
        await prisma.focusShareGuestSession.delete({ where: { id: session.id } }).catch(() => undefined);
      }
      throw new TreemichAuthError("Unauthorized");
    }
    return {
      session: {
        id: session.id,
        focusShareId: session.focusShareId,
        expiresAt: session.expiresAt
      },
      share: {
        id: session.focusShare.id,
        userId: session.focusShare.userId,
        ...toGuestView(session.focusShare)
      }
    };
  }

  private async requireOwnedShare(userId: string, shareId: string) {
    const existing = await prisma.focusShare.findFirst({
      where: { id: shareId, userId },
      select: { id: true }
    });
    if (!existing) {
      throw new HttpNotFoundError("Focus share not found");
    }
  }
}

const toGuestView = (row: {
  publicId: string;
  label: string | null;
  focusAnchorPersonId: string;
  maxAncestorDepth: number;
  maxDescendantDepth: number;
  maxCollateralDepth: number;
}): FocusShareGuestView => ({
  publicId: row.publicId,
  label: row.label,
  focusAnchorPersonId: row.focusAnchorPersonId,
  maxAncestorDepth: row.maxAncestorDepth,
  maxDescendantDepth: row.maxDescendantDepth,
  maxCollateralDepth: row.maxCollateralDepth
});

const clampDepth = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
