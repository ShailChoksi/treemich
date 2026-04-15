import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { TreemichAuthError, type AuthenticatedRequestContext } from "./service.js";

const sessionCookieName = env.TREEMICH_SESSION_COOKIE_NAME;

const appendCookieAttribute = (parts: string[], enabled: boolean, attribute: string) => {
  if (enabled) {
    parts.push(attribute);
  }
};

export const readCookie = (request: FastifyRequest, cookieName = sessionCookieName) => {
  const rawCookieHeader = request.headers.cookie;
  if (!rawCookieHeader) {
    return null;
  }

  for (const pair of rawCookieHeader.split(";")) {
    const [rawName, ...valueParts] = pair.trim().split("=");
    if (rawName !== cookieName) {
      continue;
    }

    return decodeURIComponent(valueParts.join("="));
  }

  return null;
};

export const setSessionCookie = (reply: FastifyReply, token: string) => {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(env.TREEMICH_SESSION_TTL_MS / 1000)}`
  ];
  appendCookieAttribute(parts, env.NODE_ENV === "production", "Secure");
  reply.header("Set-Cookie", parts.join("; "));
};

export const clearSessionCookie = (reply: FastifyReply) => {
  const parts = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ];
  appendCookieAttribute(parts, env.NODE_ENV === "production", "Secure");
  reply.header("Set-Cookie", parts.join("; "));
};

export const getRequiredAuth = (request: FastifyRequest): AuthenticatedRequestContext => {
  if (!request.auth) {
    throw new TreemichAuthError("Unauthorized");
  }
  return request.auth;
};
