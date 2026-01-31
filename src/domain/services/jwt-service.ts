/**
 * Port for JWT token operations.
 * Implementation should handle signing and verification of JWT tokens.
 */
export interface JwtService {
  /**
   * Sign a payload into a JWT token.
   * @param payload - The data to encode in the token
   * @param secret - The secret key for signing
   * @returns The signed JWT token string
   */
  sign(payload: object, secret: string): Promise<string>;

  /**
   * Verify and decode a JWT token.
   * @param token - The JWT token to verify
   * @param secret - The secret key for verification
   * @returns The decoded payload
   * @throws Error if token is invalid or expired
   */
  verify(token: string, secret: string): Promise<object>;
}
