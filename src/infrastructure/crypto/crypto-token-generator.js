import { base64UrlEncode } from '../../shared/utils/base64url';
/**
 * Implementation of TokenGenerator using Web Crypto API.
 * Generates cryptographically secure random tokens.
 */
export class CryptoTokenGenerator {
    bytes;
    constructor(bytes = 32) {
        this.bytes = bytes;
    }
    generate() {
        const buffer = new Uint8Array(this.bytes);
        crypto.getRandomValues(buffer);
        return base64UrlEncode(buffer);
    }
}
