import type { Prisma } from "@prisma/client";
import type { AuthState } from "@treemich/shared";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { createOpaqueToken, encryptSecret, hashToken } from "./crypto.js";
import { loginToImmich } from "../integrations/immich/client.js";

const authSessionInclude = {
  user: {
    include: {
      linkedAccount: true
    }
  }
} as const satisfies Prisma.TreemichSessionInclude;

type SessionWithUser = Prisma.TreemichSessionGetPayload<{
  include: typeof authSessionInclude;
}>;

const legacySharedUserId = "legacy-shared-user";

export class TreemichAuthError extends Error {
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "TreemichAuthError";
  }
}

export type AuthenticatedRequestContext = {
  user: SessionWithUser["user"];
  linkedAccount: NonNullable<SessionWithUser["user"]["linkedAccount"]>;
  session: SessionWithUser;
};

export class AuthService {
  async loginWithImmich(
    email: string,
    password: string
  ): Promise<{
    sessionToken: string;
    state: AuthState;
  }> {
    const login = await loginToImmich({
      baseUrl: env.IMMICH_BASE_URL,
      email,
      password
    });

    const encryptedToken = encryptSecret(login.accessToken);
    const user = await prisma.treemichUser.upsert({
      where: {
        immichBaseUrl_immichUserId: {
          immichBaseUrl: env.IMMICH_BASE_URL,
          immichUserId: login.userId
        }
      },
      update: {
        immichEmail: login.userEmail,
        immichName: login.name
      },
      create: {
        immichBaseUrl: env.IMMICH_BASE_URL,
        immichUserId: login.userId,
        immichEmail: login.userEmail,
        immichName: login.name
      }
    });

    await this.claimLegacyData(user.id);

    await prisma.linkedImmichAccount.upsert({
      where: {
        userId: user.id
      },
      update: {
        immichBaseUrl: env.IMMICH_BASE_URL,
        immichUserId: login.userId,
        immichEmail: login.userEmail,
        immichName: login.name,
        encryptedAccessToken: encryptedToken.encryptedValue,
        accessTokenIv: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        lastValidatedAt: new Date()
      },
      create: {
        userId: user.id,
        immichBaseUrl: env.IMMICH_BASE_URL,
        immichUserId: login.userId,
        immichEmail: login.userEmail,
        immichName: login.name,
        encryptedAccessToken: encryptedToken.encryptedValue,
        accessTokenIv: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        lastValidatedAt: new Date()
      }
    });

    const sessionToken = createOpaqueToken();
    await prisma.treemichSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: new Date(Date.now() + env.TREEMICH_SESSION_TTL_MS)
      }
    });

    return {
      sessionToken,
      state: {
        authenticated: true,
        user: {
          id: user.id,
          immichUserId: user.immichUserId,
          email: user.immichEmail,
          name: user.immichName
        },
        linkStatus: {
          linked: true,
          immichBaseUrl: user.immichBaseUrl,
          immichEmail: user.immichEmail,
          immichName: user.immichName
        }
      }
    };
  }

  async getAuthState(sessionToken?: string | null): Promise<AuthState> {
    const context = await this.resolveSession(sessionToken);
    if (!context) {
      return {
        authenticated: false,
        linkStatus: {
          linked: false
        }
      };
    }

    return {
      authenticated: true,
      user: {
        id: context.user.id,
        immichUserId: context.user.immichUserId,
        email: context.user.immichEmail,
        name: context.user.immichName
      },
      linkStatus: {
        linked: true,
        immichBaseUrl: context.linkedAccount.immichBaseUrl,
        immichEmail: context.linkedAccount.immichEmail,
        immichName: context.linkedAccount.immichName
      }
    };
  }

  async requireSession(sessionToken?: string | null) {
    const context = await this.resolveSession(sessionToken);
    if (!context) {
      throw new TreemichAuthError("Unauthorized");
    }
    return context;
  }

  async logout(sessionToken?: string | null) {
    if (!sessionToken) {
      return;
    }

    await prisma.treemichSession.deleteMany({
      where: {
        tokenHash: hashToken(sessionToken)
      }
    });
  }

  async cleanupExpiredSessions(referenceTime = new Date()) {
    const result = await prisma.treemichSession.deleteMany({
      where: {
        expiresAt: {
          lte: referenceTime
        }
      }
    });

    return result.count;
  }

  private async resolveSession(sessionToken?: string | null): Promise<AuthenticatedRequestContext | null> {
    if (!sessionToken) {
      return null;
    }

    const session = await prisma.treemichSession.findUnique({
      where: {
        tokenHash: hashToken(sessionToken)
      },
      include: authSessionInclude
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await prisma.treemichSession.delete({
        where: {
          id: session.id
        }
      });
      return null;
    }

    if (!session.user.linkedAccount) {
      throw new TreemichAuthError("Immich account is not linked");
    }

    return {
      user: session.user,
      linkedAccount: session.user.linkedAccount,
      session
    };
  }

  private async claimLegacyData(userId: string) {
    if (userId === legacySharedUserId) {
      return;
    }

    const [existingProfileCount, existingRelationshipCount, legacyProfileCount, legacyRelationshipCount] =
      await Promise.all([
        prisma.personProfile.count({ where: { userId } }),
        prisma.relationship.count({ where: { userId } }),
        prisma.personProfile.count({ where: { userId: legacySharedUserId } }),
        prisma.relationship.count({ where: { userId: legacySharedUserId } })
      ]);

    if (existingProfileCount > 0 || existingRelationshipCount > 0) {
      return;
    }

    if (legacyProfileCount === 0 && legacyRelationshipCount === 0) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.personProfile.updateMany({
        where: { userId: legacySharedUserId },
        data: { userId }
      });
      await tx.relationship.updateMany({
        where: { userId: legacySharedUserId },
        data: { userId }
      });
      await tx.treemichUser.deleteMany({
        where: {
          id: legacySharedUserId,
          profiles: { none: {} },
          relationships: { none: {} },
          sessions: { none: {} },
          linkedAccount: null
        }
      });
    });
  }
}
