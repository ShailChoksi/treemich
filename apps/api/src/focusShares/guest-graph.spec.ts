import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "../auth/crypto.js";
import { TreemichAuthError } from "../auth/service.js";

const mocks = vi.hoisted(() => ({
  focusShareGuestSessionFindUnique: vi.fn(),
  focusShareGuestSessionDelete: vi.fn(),
  relationshipFindMany: vi.fn(),
  personProfileFindMany: vi.fn(),
  treemichUserFindUnique: vi.fn()
}));

vi.mock("../config/env.js", () => ({
  env: {
    TREEMICH_SHARE_SESSION_TTL_MS: 4 * 60 * 60 * 1000
  }
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    focusShareGuestSession: {
      findUnique: mocks.focusShareGuestSessionFindUnique,
      delete: mocks.focusShareGuestSessionDelete
    },
    relationship: {
      findMany: mocks.relationshipFindMany
    },
    personProfile: {
      findMany: mocks.personProfileFindMany
    },
    treemichUser: {
      findUnique: mocks.treemichUserFindUnique
    }
  }
}));

vi.mock("../personNames/service.js", () => ({
  resolveDisplayNameForPerson: ({
    displayNameOverride,
    givenName,
    surname,
    immichName
  }: {
    displayNameOverride: string | null;
    givenName: string | null;
    surname: string | null;
    immichName: string;
  }) => displayNameOverride || [givenName, surname].filter(Boolean).join(" ") || immichName
}));

import { FocusShareService } from "./service.js";

const shareRow = {
  id: "share-1",
  userId: "user-1",
  publicId: "pub-1",
  label: "Reunion",
  focusAnchorPersonId: "A",
  maxAncestorDepth: 2,
  maxDescendantDepth: 1,
  maxCollateralDepth: 0,
  passwordHash: "x",
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("FocusShareService.getGuestGraph", () => {
  const service = new FocusShareService({ resolveProfile: vi.fn() });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.focusShareGuestSessionFindUnique.mockResolvedValue({
      id: "guest-1",
      focusShareId: "share-1",
      expiresAt: new Date(Date.now() + 60_000),
      focusShare: shareRow
    });
    mocks.treemichUserFindUnique.mockResolvedValue({
      preferences: {
        primaryFamilyUnitByPersonId: {
          A: "P|SpouseA",
          Outsider: "x|y"
        },
        treeLayoutPreferences: {
          horizontalSpacing: 1.25
        }
      }
    });
    mocks.relationshipFindMany.mockResolvedValue([
      { id: "r1", fromPersonId: "P", toPersonId: "A", type: "PARENT_OF" },
      { id: "r2", fromPersonId: "P", toPersonId: "Sib", type: "PARENT_OF" },
      { id: "r3", fromPersonId: "A", toPersonId: "SpouseA", type: "SPOUSE_OF" },
      { id: "r4", fromPersonId: "Sib", toPersonId: "Niece", type: "PARENT_OF" },
      { id: "r5", fromPersonId: "Out", toPersonId: "Side", type: "FRIEND_OF" }
    ]);
    mocks.personProfileFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({
        id,
        givenName: id,
        surname: null,
        displayNameOverride: null,
        thumbnails: id === "A" ? [{ id: "t1", storageUrl: "media://a" }] : [],
        externalIdentities: [],
        personNames: [],
        lifeEvents: []
      }))
    );
  });

  it("returns membership people/edges and clamps depths to share maxes", async () => {
    const graph = await service.getGuestGraph("token", {
      ancestorDepth: 99,
      descendantDepth: 99,
      collateralDepth: 99
    });

    expect(graph.depths).toEqual({
      ancestorDepth: 2,
      descendantDepth: 1,
      collateralDepth: 0
    });
    const ids = new Set(graph.people.map((person) => person.id));
    expect(ids.has("A")).toBe(true);
    expect(ids.has("P")).toBe(true);
    expect(ids.has("Sib")).toBe(true);
    expect(ids.has("SpouseA")).toBe(true);
    expect(ids.has("Niece")).toBe(false);
    expect(ids.has("Out")).toBe(false);
    expect(graph.relationships.every((edge) => ids.has(edge.fromPersonId) && ids.has(edge.toPersonId))).toBe(
      true
    );
    expect(graph.relationships.some((edge) => edge.id === "r5")).toBe(false);
    expect(graph.people.find((person) => person.id === "A")?.hasThumbnail).toBe(true);
    expect(graph.layout).toEqual({
      primaryFamilyUnitByPersonId: { A: "P|SpouseA" },
      treeLayoutPreferences: { horizontalSpacing: 1.25 }
    });
    expect(mocks.focusShareGuestSessionFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken("token") },
      include: { focusShare: true }
    });
  });

  it("defaults omitted depths to share maxes", async () => {
    const graph = await service.getGuestGraph("token", {});
    expect(graph.depths).toEqual({
      ancestorDepth: 2,
      descendantDepth: 1,
      collateralDepth: 0
    });
  });

  it("includes birth and death dates from life events when present", async () => {
    mocks.personProfileFindMany.mockResolvedValue([
      {
        id: "A",
        givenName: "Ada",
        surname: null,
        displayNameOverride: null,
        thumbnails: [],
        externalIdentities: [],
        personNames: [],
        lifeEvents: [
          { eventType: "BIRTH", year: 1950, month: 3, day: 12 },
          { eventType: "DEATH", year: 2020, month: null, day: null }
        ]
      }
    ]);

    const graph = await service.getGuestGraph("token", {
      ancestorDepth: 0,
      descendantDepth: 0,
      collateralDepth: 0
    });

    expect(graph.people.find((person) => person.id === "A")).toMatchObject({
      birthDate: "1950-03-12",
      deathDate: "2020"
    });
  });

  it("uses Immich display names and marks Immich-linked thumbs as available", async () => {
    mocks.personProfileFindMany.mockResolvedValue([
      {
        id: "A",
        givenName: null,
        surname: null,
        displayNameOverride: null,
        thumbnails: [],
        externalIdentities: [{ displayName: "Rutvi Choksi", providerPersonId: "immich-1" }],
        personNames: [],
        lifeEvents: []
      }
    ]);

    const graph = await service.getGuestGraph("token", {
      ancestorDepth: 0,
      descendantDepth: 0,
      collateralDepth: 0
    });

    expect(graph.people).toEqual([
      {
        id: "A",
        name: "Rutvi Choksi",
        givenName: null,
        surname: null,
        hasThumbnail: true,
        hasImmichLink: true,
        birthDate: null,
        deathDate: null
      }
    ]);
  });

  it("rejects missing guest sessions", async () => {
    mocks.focusShareGuestSessionFindUnique.mockResolvedValue(null);
    await expect(service.getGuestGraph(null, {})).rejects.toBeInstanceOf(TreemichAuthError);
  });
});
