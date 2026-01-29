import { base64UrlDecode, base64UrlEncode } from '../../shared/utils/base64url';

export type JwtPayload = {
  sub: string;
  roles: string[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
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

export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerSegment = base64UrlEncode(JSON.stringify(header));
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = await hmacSha256(secret, signingInput);
  const signatureSegment = base64UrlEncode(signature);
  return `${signingInput}.${signatureSegment}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const expectedSignature = await hmacSha256(secret, signingInput);
  const expectedSignatureSegment = base64UrlEncode(expectedSignature);
  if (expectedSignatureSegment !== signatureSegment) return null;

  const payloadRaw = Buffer.from(base64UrlDecode(payloadSegment)).toString('utf-8');
  const payload = JSON.parse(payloadRaw) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;
  return payload;
}
