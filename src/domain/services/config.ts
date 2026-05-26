/**
 * Port for application configuration.
 * Implementation should provide access to environment-specific settings.
 */
export interface Config {
  readonly jwtSecret: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly jwtTtlSeconds: number;
  readonly emailConfirmTtlMinutes: number;
  readonly passwordResetTtlMinutes: number;
  readonly refreshTokenTtlDays: number;
  readonly frontendUrl: string;
  readonly usdToBrlExchangeRate: number;
}
