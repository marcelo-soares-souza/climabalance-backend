import type { HashService } from '../../domain/services/hash-service';

/**
 * Implementation of HashService using Web Crypto API.
 * Provides SHA-256 hashing.
 */
export class WebCryptoHashService implements HashService {
  async sha256(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Buffer.from(digest).toString('hex');
  }
}
