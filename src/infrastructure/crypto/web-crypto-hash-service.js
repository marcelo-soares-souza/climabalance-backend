/**
 * Implementation of HashService using Web Crypto API.
 * Provides SHA-256 hashing.
 */
export class WebCryptoHashService {
    async sha256(input) {
        const data = new TextEncoder().encode(input);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return Buffer.from(digest).toString('hex');
    }
}
