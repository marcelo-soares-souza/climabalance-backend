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

function parseKeys(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch { /* ignore */ }
  return {};
}

export class HS256JwtService implements JwtService {
  async sign(payload: object, secret: string): Promise<string> {
    const p = payload as Record<string, unknown>;
    const header: Record<string, string> = { alg: 'HS256', typ: 'JWT' };
    if (p.kid) header.kid = p.kid as string;
    const headerSegment = base64UrlEncode(JSON.stringify(header));
    const payloadSegment = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerSegment}.${payloadSegment}`;
    const signature = await hmacSha256(secret, signingInput);
    const signatureSegment = base64UrlEncode(signature);
    return `${signingInput}.${signatureSegment}`;
  }

  async verify(token: string, secret: string, keys?: string): Promise<object> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');

    const [headerSegment, payloadSegment, signatureSegment] = parts;

    let signingSecret = secret;
    if (keys) {
      try {
        const rawHeader = Buffer.from(base64UrlDecode(headerSegment)).toString('utf-8');
        const h = JSON.parse(rawHeader);
        if (h.kid) {
          const keyMap = parseKeys(keys);
          if (keyMap[h.kid]) signingSecret = keyMap[h.kid];
        }
      } catch { /* ignore */ }
    }

    const signingInput = `${headerSegment}.${payloadSegment}`;
    const expectedSignature = await hmacSha256(signingSecret, signingInput);
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
