import type { Config } from "../../domain/services/config";
import { env } from "../../shared/utils/env";

/**
 * Implementation of Config using process.env.
 * Loads configuration from environment variables.
 */
export class EnvironmentConfig implements Config {
  readonly jwtSecret: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly jwtTtlSeconds: number;
  readonly emailConfirmTtlMinutes: number;
  readonly passwordResetTtlMinutes: number;
  readonly refreshTokenTtlDays: number;
  readonly frontendUrl: string;
  readonly usdToBrlExchangeRate: number;

  constructor() {
    this.jwtSecret = env.jwtSecret;
    this.jwtIssuer = env.jwtIssuer;
    this.jwtAudience = env.jwtAudience;
    this.jwtTtlSeconds = env.jwtTtlSeconds;
    this.emailConfirmTtlMinutes = env.emailConfirmTtlMinutes;
    this.passwordResetTtlMinutes = env.passwordResetTtlMinutes;
    this.refreshTokenTtlDays = env.refreshTokenTtlDays;
    this.frontendUrl = env.frontendUrl;
    this.usdToBrlExchangeRate = env.usdToBrlExchangeRate;
  }
}
