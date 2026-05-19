import { env } from "../utils/env";

export function parseCookieHeader(
  header: string | null,
): Record<string, string> {
  if (!header) return {};

  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function getRefreshTokenFromCookie(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return cookies[env.refreshCookieName] ?? null;
}

export function buildRefreshTokenCookie(
  token: string,
  maxAgeSeconds: number,
): string {
  const parts = [
    `${env.refreshCookieName}=${encodeURIComponent(token)}`,
    `Path=${env.refreshCookiePath}`,
    "HttpOnly",
    `SameSite=${capitalizeSameSite(env.refreshCookieSameSite)}`,
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (env.refreshCookieDomain) {
    parts.push(`Domain=${env.refreshCookieDomain}`);
  }
  if (env.refreshCookieSecure) {
    parts.push("Secure");
  }
  if (env.refreshCookieSameSite === "none") {
    parts.push("Partitioned");
  }

  return parts.join("; ");
}

export function buildRefreshTokenCookieCleared(): string {
  const parts = [
    `${env.refreshCookieName}=`,
    `Path=${env.refreshCookiePath}`,
    "HttpOnly",
    `SameSite=${capitalizeSameSite(env.refreshCookieSameSite)}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];

  if (env.refreshCookieDomain) {
    parts.push(`Domain=${env.refreshCookieDomain}`);
  }
  if (env.refreshCookieSecure) {
    parts.push("Secure");
  }
  if (env.refreshCookieSameSite === "none") {
    parts.push("Partitioned");
  }

  return parts.join("; ");
}

function capitalizeSameSite(
  value: "lax" | "strict" | "none",
): "Lax" | "Strict" | "None" {
  if (value === "strict") return "Strict";
  if (value === "none") return "None";
  return "Lax";
}
