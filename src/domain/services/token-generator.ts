/**
 * Port for generating random tokens.
 * Implementation should provide cryptographically secure random tokens.
 */
export interface TokenGenerator {
  /**
   * Generate a random token string.
   * @returns A random token (e.g., base64url encoded random bytes)
   */
  generate(): string;
}
