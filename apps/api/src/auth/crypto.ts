import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import { env } from "../config/env.js";

const encryptionAlgorithm = "aes-256-gcm";

const getEncryptionKey = () => Buffer.from(env.TREEMICH_ENCRYPTION_KEY, "hex");

export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");

export const createOpaqueToken = () => randomBytes(32).toString("base64url");

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
};

export const verifyPassword = (password: string, storedHash: string) => {
  const [algorithm, salt, hash] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, salt, expected.byteLength);
  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
};

export const encryptSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(encryptionAlgorithm, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64")
  };
};

export const decryptSecret = (input: { encryptedValue: string; iv: string; authTag: string }) => {
  const decipher = createDecipheriv(encryptionAlgorithm, getEncryptionKey(), Buffer.from(input.iv, "base64"));
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(input.encryptedValue, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
};
