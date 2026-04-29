import { hashToken } from "../../auth/crypto.js";
import { decryptSecret } from "../../auth/crypto.js";
import { env } from "../../config/env.js";
import { ImmichClient } from "./client.js";

type LinkedImmichAccount = {
  id: string;
  userId: string;
  immichBaseUrl: string;
  encryptedAccessToken: string;
  accessTokenIv: string;
  accessTokenTag: string;
};

type CachedClientEntry = {
  client: ImmichClient;
  expiresAt: number;
  userId: string;
};

export class ImmichClientFactory {
  private readonly clients = new Map<string, CachedClientEntry>();
  private readonly clientTtlMs = 30 * 60_000;
  private readonly maxClients = 100;

  private evictExpiredClients(now: number) {
    for (const [clientKey, entry] of this.clients.entries()) {
      if (entry.expiresAt > now) {
        continue;
      }

      entry.client.dispose();
      this.clients.delete(clientKey);
    }
  }

  private evictOtherClientsForUser(userId: string, activeClientKey: string) {
    for (const [clientKey, entry] of this.clients.entries()) {
      if (clientKey === activeClientKey || entry.userId !== userId) {
        continue;
      }

      entry.client.dispose();
      this.clients.delete(clientKey);
    }
  }

  private evictOverflowClients() {
    while (this.clients.size > this.maxClients) {
      const oldestClientKey = this.clients.keys().next().value;
      if (!oldestClientKey) {
        break;
      }

      const oldestEntry = this.clients.get(oldestClientKey);
      oldestEntry?.client.dispose();
      this.clients.delete(oldestClientKey);
    }
  }

  dispose() {
    for (const entry of this.clients.values()) {
      entry.client.dispose();
    }

    this.clients.clear();
  }

  getClient(account: LinkedImmichAccount) {
    const now = Date.now();
    this.evictExpiredClients(now);

    const accessToken = decryptSecret({
      encryptedValue: account.encryptedAccessToken,
      iv: account.accessTokenIv,
      authTag: account.accessTokenTag
    });
    const clientKey = `${account.userId}:${hashToken(accessToken)}`;

    const cachedEntry = this.clients.get(clientKey);
    if (cachedEntry) {
      cachedEntry.client.clearExpiredCacheEntries(now);
      cachedEntry.expiresAt = now + this.clientTtlMs;
      this.clients.delete(clientKey);
      this.clients.set(clientKey, cachedEntry);
      return cachedEntry.client;
    }

    this.evictOtherClientsForUser(account.userId, clientKey);

    const client = new ImmichClient({
      baseUrl: account.immichBaseUrl,
      accessToken,
      peoplePageSize: env.IMMICH_PEOPLE_PAGE_SIZE,
      timeoutMs: env.IMMICH_HTTP_TIMEOUT_MS,
      maxRetries: env.IMMICH_HTTP_MAX_RETRIES,
      retryBaseDelayMs: env.IMMICH_HTTP_RETRY_BASE_DELAY_MS
    });
    this.clients.set(clientKey, {
      client,
      expiresAt: now + this.clientTtlMs,
      userId: account.userId
    });
    this.evictOverflowClients();
    return client;
  }
}
