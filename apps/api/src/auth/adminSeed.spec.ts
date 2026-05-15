/**
 * @packageDocumentation
 * Unit tests for ensureAdminAccount — admin seeding and password re-hash on env change.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  treemichUserFindFirst: vi.fn(),
  treemichUserCreate: vi.fn(),
  treemichUserUpdate: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn()
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    treemichUser: {
      findFirst: mocks.treemichUserFindFirst,
      create: mocks.treemichUserCreate,
      update: mocks.treemichUserUpdate
    }
  }
}));

vi.mock("../config/env.js", () => ({
  env: {
    TREEMICH_ADMIN_PASSWORD: "test-admin-pass"
  }
}));

vi.mock("./crypto.js", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword
}));

describe("ensureAdminAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashPassword.mockReturnValue("hashed-admin-pass");
  });

  it("creates the admin user when no admin exists yet", async () => {
    mocks.treemichUserFindFirst.mockResolvedValue(null);
    mocks.treemichUserCreate.mockResolvedValue({
      id: "admin-1",
      email: "admin@treemich.local",
      name: "Admin",
      isAdmin: true,
      passwordChangeRequired: true
    });

    const { ensureAdminAccount } = await import("./adminSeed.js");
    await ensureAdminAccount();

    expect(mocks.treemichUserCreate).toHaveBeenCalledWith({
      data: {
        email: "admin@treemich.local",
        name: "Admin",
        passwordHash: "hashed-admin-pass",
        isAdmin: true,
        passwordChangeRequired: true
      }
    });
    expect(mocks.hashPassword).toHaveBeenCalledWith("test-admin-pass");
    expect(mocks.treemichUserUpdate).not.toHaveBeenCalled();
  });

  it("does nothing when admin exists and password is still correct", async () => {
    mocks.treemichUserFindFirst.mockResolvedValue({
      id: "admin-1",
      passwordHash: "existing-hash",
      isAdmin: true
    });
    mocks.verifyPassword.mockReturnValue(true);

    const { ensureAdminAccount } = await import("./adminSeed.js");
    await ensureAdminAccount();

    expect(mocks.treemichUserUpdate).not.toHaveBeenCalled();
    expect(mocks.treemichUserCreate).not.toHaveBeenCalled();
    expect(mocks.verifyPassword).toHaveBeenCalledWith("test-admin-pass", "existing-hash");
  });

  it("re-hashes the password when admin exists but env password changed", async () => {
    mocks.treemichUserFindFirst.mockResolvedValue({
      id: "admin-1",
      passwordHash: "old-hash",
      isAdmin: true
    });
    mocks.verifyPassword.mockReturnValue(false);

    const { ensureAdminAccount } = await import("./adminSeed.js");
    await ensureAdminAccount();

    expect(mocks.treemichUserUpdate).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { passwordHash: "hashed-admin-pass" }
    });
    expect(mocks.treemichUserCreate).not.toHaveBeenCalled();
  });

  it("re-hashes when admin exists but passwordHash is null", async () => {
    mocks.treemichUserFindFirst.mockResolvedValue({
      id: "admin-1",
      passwordHash: null,
      isAdmin: true
    });

    const { ensureAdminAccount } = await import("./adminSeed.js");
    await ensureAdminAccount();

    expect(mocks.treemichUserUpdate).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { passwordHash: "hashed-admin-pass" }
    });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.treemichUserCreate).not.toHaveBeenCalled();
  });
});
