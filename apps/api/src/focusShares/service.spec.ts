import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, hashToken, verifyPassword } from "../auth/crypto.js";
import { TreemichAuthError } from "../auth/service.js";
import { HttpNotFoundError } from "../lifeEvents/errors.js";

const mocks = vi.hoisted(() => ({
  focusShareFindMany: vi.fn(),
  focusShareCreate: vi.fn(),
  focusShareFindUnique: vi.fn(),
  focusShareFindFirst: vi.fn(),
  focusShareUpdate: vi.fn(),
  focusShareDelete: vi.fn(),
  focusShareGuestSessionCreate: vi.fn(),
  focusShareGuestSessionFindUnique: vi.fn(),
  focusShareGuestSessionDelete: vi.fn(),
  focusShareGuestSessionDeleteMany: vi.fn(),
  transaction: vi.fn(),
  resolveProfile: vi.fn()
}));

vi.mock("../config/env.js", () => ({
  env: {
    TREEMICH_SHARE_SESSION_TTL_MS: 4 * 60 * 60 * 1000
  }
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    focusShare: {
      findMany: mocks.focusShareFindMany,
      create: mocks.focusShareCreate,
      findUnique: mocks.focusShareFindUnique,
      findFirst: mocks.focusShareFindFirst,
      update: mocks.focusShareUpdate,
      delete: mocks.focusShareDelete
    },
    focusShareGuestSession: {
      create: mocks.focusShareGuestSessionCreate,
      findUnique: mocks.focusShareGuestSessionFindUnique,
      delete: mocks.focusShareGuestSessionDelete,
      deleteMany: mocks.focusShareGuestSessionDeleteMany
    },
    $transaction: mocks.transaction
  }
}));

import { FocusShareService } from "./service.js";

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "share-1",
  userId: "user-1",
  publicId: "public-abc",
  passwordHash: "scrypt:x:y",
  label: "Family reunion",
  focusAnchorPersonId: "person-1",
  maxAncestorDepth: 3,
  maxDescendantDepth: 3,
  maxCollateralDepth: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides
});

describe("FocusShareService", () => {
  const profileResolver = { resolveProfile: mocks.resolveProfile };
  const service = new FocusShareService(profileResolver);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProfile.mockImplementation(async (_userId: string, personId: string) => personId);
    mocks.transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it("lists only the caller's shares newest first", async () => {
    mocks.focusShareFindMany.mockResolvedValue([makeRow()]);
    const shares = await service.list("user-1");
    expect(mocks.focusShareFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" }
    });
    expect(shares[0]).toMatchObject({
      id: "share-1",
      publicId: "public-abc",
      publicPath: "/share/public-abc",
      label: "Family reunion",
      focusAnchorPersonId: "person-1"
    });
    expect(shares[0]?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("creates a share with hashed password and resolved anchor", async () => {
    mocks.focusShareCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      makeRow({
        publicId: data.publicId,
        passwordHash: data.passwordHash,
        label: data.label,
        focusAnchorPersonId: data.focusAnchorPersonId,
        maxAncestorDepth: data.maxAncestorDepth,
        maxDescendantDepth: data.maxDescendantDepth,
        maxCollateralDepth: data.maxCollateralDepth
      })
    );

    const created = await service.create("user-1", {
      password: "share-pass!",
      label: "Mom side",
      focusAnchorPersonId: "person-1",
      maxAncestorDepth: 4,
      maxDescendantDepth: 2,
      maxCollateralDepth: 1
    });

    expect(mocks.resolveProfile).toHaveBeenCalledWith("user-1", "person-1");
    expect(mocks.focusShareCreate).toHaveBeenCalled();
    const createData = mocks.focusShareCreate.mock.calls[0]?.[0]?.data;
    expect(createData.userId).toBe("user-1");
    expect(typeof createData.publicId).toBe("string");
    expect(createData.publicId.length).toBeGreaterThan(20);
    expect(verifyPassword("share-pass!", createData.passwordHash)).toBe(true);
    expect(created.label).toBe("Mom side");
    expect(created.maxAncestorDepth).toBe(4);
  });

  it("rejects patch/rotate/revoke for another user's share", async () => {
    mocks.focusShareFindFirst.mockResolvedValue(null);
    await expect(service.update("user-2", "share-1", { label: "stolen" })).rejects.toBeInstanceOf(
      HttpNotFoundError
    );
    await expect(service.rotatePassword("user-2", "share-1", "new-password")).rejects.toBeInstanceOf(
      HttpNotFoundError
    );
    await expect(service.revoke("user-2", "share-1")).rejects.toBeInstanceOf(HttpNotFoundError);
    expect(mocks.focusShareUpdate).not.toHaveBeenCalled();
    expect(mocks.focusShareDelete).not.toHaveBeenCalled();
  });

  it("rotatePassword updates hash and deletes guest sessions", async () => {
    mocks.focusShareFindFirst.mockResolvedValue({ id: "share-1" });
    const updatedRow = makeRow({ passwordHash: "new-hash" });
    mocks.focusShareUpdate.mockResolvedValue(updatedRow);
    mocks.focusShareGuestSessionDeleteMany.mockResolvedValue({ count: 2 });

    const result = await service.rotatePassword("user-1", "share-1", "rotated-pass!");

    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.focusShareUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "share-1" },
        data: expect.objectContaining({
          passwordHash: expect.any(String)
        })
      })
    );
    const newHash = mocks.focusShareUpdate.mock.calls[0]?.[0]?.data?.passwordHash as string;
    expect(verifyPassword("rotated-pass!", newHash)).toBe(true);
    expect(mocks.focusShareGuestSessionDeleteMany).toHaveBeenCalledWith({
      where: { focusShareId: "share-1" }
    });
    expect(result.publicId).toBe("public-abc");
  });

  it("revoke hard-deletes the share", async () => {
    mocks.focusShareFindFirst.mockResolvedValue({ id: "share-1" });
    mocks.focusShareDelete.mockResolvedValue(makeRow());
    await service.revoke("user-1", "share-1");
    expect(mocks.focusShareDelete).toHaveBeenCalledWith({ where: { id: "share-1" } });
  });

  it("update patches cone fields for the owner", async () => {
    mocks.focusShareFindFirst.mockResolvedValue({ id: "share-1" });
    mocks.focusShareUpdate.mockResolvedValue(
      makeRow({ maxAncestorDepth: 5, label: "Updated", focusAnchorPersonId: "person-2" })
    );
    const updated = await service.update("user-1", "share-1", {
      label: "Updated",
      focusAnchorPersonId: "person-2",
      maxAncestorDepth: 5
    });
    expect(mocks.resolveProfile).toHaveBeenCalledWith("user-1", "person-2");
    expect(updated.label).toBe("Updated");
    expect(updated.maxAncestorDepth).toBe(5);
    expect(updated.focusAnchorPersonId).toBe("person-2");
  });

  it("unlock mints a guest session when password matches", async () => {
    const passwordHash = hashPassword("share-pass!");
    mocks.focusShareFindUnique.mockResolvedValue(makeRow({ passwordHash }));
    mocks.focusShareGuestSessionCreate.mockResolvedValue({ id: "guest-1" });

    const result = await service.unlock("public-abc", "share-pass!");

    expect(mocks.focusShareGuestSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        focusShareId: "share-1",
        tokenHash: hashToken(result.sessionToken),
        expiresAt: expect.any(Date)
      })
    });
    expect(result.response.share.publicId).toBe("public-abc");
    expect(result.response.share.label).toBe("Family reunion");
  });

  it("unlock rejects missing shares and wrong passwords", async () => {
    mocks.focusShareFindUnique.mockResolvedValue(null);
    await expect(service.unlock("missing", "share-pass!")).rejects.toBeInstanceOf(HttpNotFoundError);

    mocks.focusShareFindUnique.mockResolvedValue(makeRow({ passwordHash: hashPassword("other") }));
    await expect(service.unlock("public-abc", "share-pass!")).rejects.toBeInstanceOf(TreemichAuthError);
    expect(mocks.focusShareGuestSessionCreate).not.toHaveBeenCalled();
  });

  it("requireGuestSession rejects expired or unknown tokens", async () => {
    mocks.focusShareGuestSessionFindUnique.mockResolvedValue(null);
    await expect(service.requireGuestSession("nope")).rejects.toBeInstanceOf(TreemichAuthError);

    mocks.focusShareGuestSessionFindUnique.mockResolvedValue({
      id: "guest-1",
      focusShareId: "share-1",
      expiresAt: new Date(Date.now() - 1000),
      focusShare: makeRow()
    });
    mocks.focusShareGuestSessionDelete.mockResolvedValue({ id: "guest-1" });
    await expect(service.requireGuestSession("stale")).rejects.toBeInstanceOf(TreemichAuthError);
    expect(mocks.focusShareGuestSessionDelete).toHaveBeenCalledWith({ where: { id: "guest-1" } });
  });

  it("requireGuestSession returns share context for a live token", async () => {
    mocks.focusShareGuestSessionFindUnique.mockResolvedValue({
      id: "guest-1",
      focusShareId: "share-1",
      expiresAt: new Date(Date.now() + 60_000),
      focusShare: makeRow()
    });
    const ctx = await service.requireGuestSession("live-token");
    expect(ctx.share.userId).toBe("user-1");
    expect(ctx.share.publicId).toBe("public-abc");
    expect(ctx.session.focusShareId).toBe("share-1");
  });
});
