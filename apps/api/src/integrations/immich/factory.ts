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

export class ImmichClientFactory {
  private readonly clients = new Map<string, ImmichClient>();

  getClient(account: LinkedImmichAccount) {
    const accessToken = decryptSecret({
      encryptedValue: account.encryptedAccessToken,
      iv: account.accessTokenIv,
      authTag: account.accessTokenTag
    });
    const clientKey = `${account.userId}:${hashToken(accessToken)}`;

    const cachedClient = this.clients.get(clientKey);
    if (cachedClient) {
      return cachedClient;
    }

    const client = new ImmichClient({
      baseUrl: account.immichBaseUrl,
      accessToken,
      peoplePageSize: env.IMMICH_PEOPLE_PAGE_SIZE
    });
    this.clients.set(clientKey, client);
    return client;
  }
}
