import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpNotFoundError } from "../lifeEvents/errors.js";

const mocks = vi.hoisted(() => ({
  focusShareGuestSessionFindUnique: vi.fn(),
  relationshipFindMany: vi.fn(),
  personProfileFindFirst: vi.fn()
}));

vi.mock("../config/env.js", () => ({
  env: {
    TREEMICH_SHARE_SESSION_TTL_MS: 4 * 60 * 60 * 1000
  }
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    focusShareGuestSession: {
      findUnique: mocks.focusShareGuestSessionFindUnique
    },
    relationship: {
      findMany: mocks.relationshipFindMany
    },
    personProfile: {
      findFirst: mocks.personProfileFindFirst
    }
  }
}));

import { FocusShareService } from "./service.js";

describe("FocusShareService.requireGuestPersonInMembership", () => {
  const service = new FocusShareService({ resolveProfile: vi.fn() });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.focusShareGuestSessionFindUnique.mockResolvedValue({
      id: "guest-1",
      focusShareId: "share-1",
      expiresAt: new Date(Date.now() + 60_000),
      focusShare: {
        id: "share-1",
        userId: "user-1",
        publicId: "pub-1",
        label: null,
        focusAnchorPersonId: "A",
        maxAncestorDepth: 1,
        maxDescendantDepth: 0,
        maxCollateralDepth: 0
      }
    });
    mocks.relationshipFindMany.mockResolvedValue([
      { fromPersonId: "P", toPersonId: "A", type: "PARENT_OF" },
      { fromPersonId: "Out", toPersonId: "Side", type: "FRIEND_OF" }
    ]);
  });

  it("allows people inside the share max membership", async () => {
    mocks.personProfileFindFirst.mockResolvedValue({
      id: "A",
      givenName: "Ann",
      surname: null,
      displayNameOverride: null,
      externalIdentities: [],
      thumbnails: []
    });
    const result = await service.requireGuestPersonInMembership("token", "A");
    expect(result.person.id).toBe("A");
    expect(result.guest.share.userId).toBe("user-1");
  });

  it("404s for people outside the cone", async () => {
    await expect(service.requireGuestPersonInMembership("token", "Out")).rejects.toBeInstanceOf(
      HttpNotFoundError
    );
    expect(mocks.personProfileFindFirst).not.toHaveBeenCalled();
  });
});
