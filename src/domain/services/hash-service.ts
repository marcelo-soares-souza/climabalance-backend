/**
 * Port for hashing operations.
 * Implementation should provide cryptographic hash functions.
 */
export interface HashService {
  /**
   * Generate a SHA-256 hash of the input.
   * @param input - The string to hash
   * @returns The hash as a hexadecimal string
   */
  sha256(input: string): Promise<string>;
}
