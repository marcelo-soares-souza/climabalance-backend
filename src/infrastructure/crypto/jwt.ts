import { base64UrlDecode, base64UrlEncode } from '../../shared/utils/base64url';
import { valkey } from '../cache/valkey-client';

export type JwtPayload = {
  sub: string;
  roles: string[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti?: string;
};

const encoder = new TextEncoder();

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(signature);
}

function parseKeys(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch { /* ignore */ }
  return {};
}

export async function signJwt(payload: JwtPayload, secret: string, kid?: string): Promise<string> {
  const header: Record<string, string> = { alg: 'HS256', typ: 'JWT' };
  if (kid) header.kid = kid;
  const headerSegment = base64UrlEncode(JSON.stringify(header));
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = await hmacSha256(secret, signingInput);
  const signatureSegment = base64UrlEncode(signature);
  return `${signingInput}.${signatureSegment}`;
}

async function isJtiBlocklisted(jti: string): Promise<boolean> {
  try {
    const result = await valkey.get(`jti:${jti}`);
    return result !== null;
  } catch {
    return false;
  }
}

export async function blocklistJti(jti: string, ttlSeconds: number): Promise<void> {
  try {
    await valkey.set(`jti:${jti}`, '1', 'EX', ttlSeconds);
  } catch { /* valkey unavailable */ }
}

function decodeHeader(token: string): Record<string, string> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const raw = Buffer.from(base64UrlDecode(parts[0])).toString('utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function verifyJwt(
  token: string,
  secret: string,
  keys?: string
): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerSegment, payloadSegment, signatureSegment] = parts;

  // Resolve signing key
  let signingSecret = secret;
  const header = decodeHeader(token);
  if (header?.kid && keys) {
    const keyMap = parseKeys(keys);
    if (keyMap[header.kid]) {
      signingSecret = keyMap[header.kid];
    }
  }

  const signingInput = `${headerSegment}.${payloadSegment}`;
  const expectedSignature = await hmacSha256(signingSecret, signingInput);
  const expectedSignatureSegment = base64UrlEncode(expectedSignature);
  if (expectedSignatureSegment !== signatureSegment) return null;

  const payloadRaw = Buffer.from(base64UrlDecode(payloadSegment)).toString('utf-8');
  const payload = JSON.parse(payloadRaw) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  // JTI blocklist check
  if (payload.jti) {
    const blocklisted = await isJtiBlocklisted(payload.jti);
    if (blocklisted) return null;
  }

  return payload;
}
