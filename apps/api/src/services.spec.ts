import { describe, expect, it, vi } from "vitest";
import { getImmichClientForRequest } from "./services.js";

describe("getImmichClientForRequest", () => {
  type RequestForImmichClient = Parameters<typeof getImmichClientForRequest>[0];

  it("uses linked auth context directly when already present", async () => {
    const linkedAccount = {
      id: "link-1",
      userId: "user-1",
      immichBaseUrl: "http://immich",
      immichUserId: "immich-user-1",
      immichEmail: "user@example.com",
      immichName: "User",
      encryptedAccessToken: "token",
      accessTokenIv: "iv",
      accessTokenTag: "tag",
      accessTokenExpiresAt: null,
      lastValidatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const client = { listPeople: vi.fn() };
    const request = {
      auth: {
        user: {
          id: "user-1",
          immichBaseUrl: "http://immich",
          immichUserId: "immich-user-1",
          immichEmail: "user@example.com",
          immichName: "User",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        session: {
          id: "session-1",
          userId: "user-1",
          tokenHash: "hash",
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          updatedAt: new Date()
        },
        linkedAccount
      },
      headers: {},
      server: {
        services: {
          authService: {
            requireLinkedSession: vi.fn()
          },
          immichClientFactory: {
            getClient: vi.fn().mockReturnValue(client)
          }
        }
      }
    };

    const resolvedClient = await getImmichClientForRequest(request as unknown as RequestForImmichClient);
    expect(resolvedClient).toBe(client);
    expect(request.server.services.authService.requireLinkedSession).toHaveBeenCalledTimes(0);
    expect(request.server.services.immichClientFactory.getClient).toHaveBeenCalledWith(linkedAccount);
  });

  it("loads linked auth context when request only has light auth", async () => {
    const linkedAuthContext = {
      user: {
        id: "user-1",
        immichBaseUrl: "http://immich",
        immichUserId: "immich-user-1",
        immichEmail: "user@example.com",
        immichName: "User",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      session: {
        id: "session-1",
        userId: "user-1",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      linkedAccount: {
        id: "link-1",
        userId: "user-1",
        immichBaseUrl: "http://immich",
        immichUserId: "immich-user-1",
        immichEmail: "user@example.com",
        immichName: "User",
        encryptedAccessToken: "token",
        accessTokenIv: "iv",
        accessTokenTag: "tag",
        accessTokenExpiresAt: null,
        lastValidatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };
    const client = { listPeople: vi.fn() };
    const requireLinkedSession = vi.fn().mockResolvedValue(linkedAuthContext);

    const request = {
      auth: {
        user: linkedAuthContext.user,
        session: linkedAuthContext.session
      },
      headers: { cookie: "treemich_session=test-token" },
      server: {
        services: {
          authService: {
            requireLinkedSession
          },
          immichClientFactory: {
            getClient: vi.fn().mockReturnValue(client)
          }
        }
      }
    };

    const resolvedClient = await getImmichClientForRequest(request as unknown as RequestForImmichClient);
    expect(resolvedClient).toBe(client);
    expect(requireLinkedSession).toHaveBeenCalledWith("test-token");
    expect(request.auth).toEqual(linkedAuthContext);
  });
});
