import type { TokenGenerator } from "../../domain/services/token-generator";
import { base64UrlEncode } from "../../shared/utils/base64url";

/**
 * Implementation of TokenGenerator using Web Crypto API.
 * Generates cryptographically secure random tokens.
 */
export class CryptoTokenGenerator implements TokenGenerator {
  constructor(private readonly bytes: number = 32) {}

  generate(): string {
    const buffer = new Uint8Array(this.bytes);
    crypto.getRandomValues(buffer);
    return base64UrlEncode(buffer);
  }
}
