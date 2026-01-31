import type { JwtService } from '../../domain/services/jwt-service';
import { base64UrlEncode, base64UrlDecode } from '../../shared/utils/base64url';

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

/**
 * Implementation of JwtService using HS256 algorithm.
 * Signs and verifies JWT tokens with HMAC-SHA256.
 */
export class HS256JwtService implements JwtService {
  async sign(payload: object, secret: string): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerSegment = base64UrlEncode(JSON.stringify(header));
    const payloadSegment = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerSegment}.${payloadSegment}`;
    const signature = await hmacSha256(secret, signingInput);
    const signatureSegment = base64UrlEncode(signature);
    return `${signingInput}.${signatureSegment}`;
  }

  async verify(token: string, secret: string): Promise<object> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const [headerSegment, payloadSegment, signatureSegment] = parts;
    const signingInput = `${headerSegment}.${payloadSegment}`;
    const expectedSignature = await hmacSha256(secret, signingInput);
    const expectedSignatureSegment = base64UrlEncode(expectedSignature);

    if (expectedSignatureSegment !== signatureSegment) {
      throw new Error('Invalid JWT signature');
    }

    const payloadRaw = Buffer.from(base64UrlDecode(payloadSegment)).toString('utf-8');
    const payload = JSON.parse(payloadRaw);

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('JWT token expired');
    }

    return payload;
  }
}
