import { env } from "../utils/env";
import { getRefreshTokenFromCookie } from "./cookies";

export const CSRF_HEADER = "x-csrf-token";

export async function buildCsrfToken(refreshToken: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.csrfSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`csrf:${refreshToken}`),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

export async function verifyRequestCsrfToken(
  request: Request,
): Promise<boolean> {
  const refreshToken = getRefreshTokenFromCookie(request);
  const csrfToken = request.headers.get(CSRF_HEADER);
  if (!refreshToken || !csrfToken) return false;
  const expected = await buildCsrfToken(refreshToken);
  return constantTimeEqual(csrfToken, expected);
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}
