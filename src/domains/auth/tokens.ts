import { createHash, randomBytes, randomUUID } from "crypto";

export const AUTH_SESSION_COOKIE = "qscm_session";
export const DEFAULT_SESSION_TTL_DAYS = 30;
export const DEFAULT_MAGIC_LINK_TTL_MINUTES = 15;

export function createOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function createAuthId(prefix: string): string {
  void prefix;
  return randomUUID();
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + DEFAULT_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function magicLinkExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + DEFAULT_MAGIC_LINK_TTL_MINUTES * 60 * 1000);
}
