export type Env = {
  appEnv: string;
  appPort: number;
  appUrl: string;
  frontendUrl: string;
  buildVersion: string;
  buildTimestampMs: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtTtlSeconds: number;
  passwordPepper: string;
  emailFrom: string;
  emailConfirmTtlMinutes: number;
  passwordResetTtlMinutes: number;
  refreshTokenTtlDays: number;
  refreshCookieName: string;
  valkeyUrl: string;
  jwtKeys: string;
  refreshCookieDomain?: string;
  refreshCookiePath: string;
  refreshCookieSameSite: 'lax' | 'strict' | 'none';
  refreshCookieSecure: boolean;
  paymentWebhookSecret: string;
  stripeSecretKey: string;
  stripePublishableKey: string;
  stripeWebhookSecret: string;
  stripePlatformFeePercent: number;
  defaultMaxPurchasableTrees: number;
  areaMediaStoragePath: string;
  certificateStoragePath: string;
  satelliteImageStoragePath: string;
  satelliteBboxSizeKm: number;
  satelliteMaxCloud: number;
  satelliteDaysBack: number;
  earthSearchEnabled: boolean;
  smtpServer?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
};

const defaultBuildTimestampMs = Date.now();

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number env: ${name}`);
  }
  return parsed;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  return value;
}

export function optionalNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  return numberEnv(name, fallback);
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  throw new Error(`Invalid boolean env: ${name}`);
}

function sameSiteEnv(name: string, fallback: 'lax' | 'strict' | 'none'): 'lax' | 'strict' | 'none' {
  const value = process.env[name];
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'lax' || normalized === 'strict' || normalized === 'none') {
    return normalized;
  }
  throw new Error(`Invalid SameSite env: ${name}`);
}

export const env: Env = {
  get appEnv() {
    return process.env.APP_ENV ?? 'local';
  },
  get appPort() {
    return numberEnv('APP_PORT', 3000);
  },
  get appUrl() {
    return process.env.APP_URL ?? 'http://localhost:3000';
  },
  get frontendUrl() {
    return process.env.FRONTEND_URL ?? 'http://localhost:3000';
  },
  get buildVersion() {
    return process.env.BUILD_VERSION ?? 'development';
  },
  get buildTimestampMs() {
    return numberEnv('BUILD_TIMESTAMP_MS', defaultBuildTimestampMs);
  },
  get databaseUrl() {
    return requiredEnv('DATABASE_URL');
  },
  get jwtSecret() {
    return requiredEnv('JWT_SECRET');
  },
  get jwtIssuer() {
    return process.env.JWT_ISSUER ?? 'climabalance';
  },
  get jwtAudience() {
    return process.env.JWT_AUDIENCE ?? 'climabalance-api';
  },
  get jwtTtlSeconds() {
    return numberEnv('JWT_TTL_SECONDS', 900);
  },
  get passwordPepper() {
    return requiredEnv('PASSWORD_PEPPER');
  },
  get emailFrom() {
    return requiredEnv('EMAIL_FROM');
  },
  get emailConfirmTtlMinutes() {
    return numberEnv('EMAIL_CONFIRM_TTL_MINUTES', 60);
  },
  get passwordResetTtlMinutes() {
    return numberEnv('PASSWORD_RESET_TTL_MINUTES', 60);
  },
  get refreshTokenTtlDays() {
    return numberEnv('REFRESH_TOKEN_TTL_DAYS', 7);
  },
  get refreshCookieName() {
    return process.env.REFRESH_COOKIE_NAME ?? 'cb_refresh_token';
  },
  get valkeyUrl() {
    return process.env.VALKEY_URL ?? 'redis://localhost:6379';
  },
  get jwtKeys() {
    return process.env.JWT_KEYS ?? '';
  },
  get refreshCookieDomain() {
    return optionalEnv('REFRESH_COOKIE_DOMAIN');
  },
  get refreshCookiePath() {
    return process.env.REFRESH_COOKIE_PATH ?? '/api/v1/auth';
  },
  get refreshCookieSameSite() {
    return sameSiteEnv('REFRESH_COOKIE_SAME_SITE', 'lax');
  },
  get refreshCookieSecure() {
    return booleanEnv('REFRESH_COOKIE_SECURE', env.appEnv === 'production' || env.appEnv === 'staging');
  },
  get paymentWebhookSecret() {
    return process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-payment-webhook-secret';
  },
  get stripeSecretKey() {
    return optionalEnv('STRIPE_SECRET_KEY') ?? '';
  },
  get stripePublishableKey() {
    return optionalEnv('STRIPE_PUBLISHABLE_KEY') ?? '';
  },
  get stripeWebhookSecret() {
    return optionalEnv('STRIPE_WEBHOOK_SECRET') ?? '';
  },
  get stripePlatformFeePercent() {
    const value = numberEnv('STRIPE_PLATFORM_FEE_PERCENT', 5);
    if (value < 0 || value > 100) {
      throw new Error('Invalid STRIPE_PLATFORM_FEE_PERCENT: must be between 0 and 100');
    }
    return value;
  },
  get defaultMaxPurchasableTrees() {
    return numberEnv('DEFAULT_MAX_PURCHASABLE_TREES', 100);
  },
  get areaMediaStoragePath() {
    return process.env.AREA_MEDIA_STORAGE_PATH ?? './storage/area-media';
  },
  get certificateStoragePath() {
    return process.env.CERTIFICATE_STORAGE_PATH ?? './storage/certificates';
  },
  get satelliteImageStoragePath() {
    return process.env.SATELLITE_IMAGE_STORAGE_PATH ?? './storage/satellite';
  },
  get satelliteBboxSizeKm() {
    return numberEnv('SATELLITE_BBOX_SIZE_KM', 4);
  },
  get satelliteMaxCloud() {
    return numberEnv('SATELLITE_MAX_CLOUD', 30);
  },
  get satelliteDaysBack() {
    return numberEnv('SATELLITE_DAYS_BACK', 20);
  },
  get earthSearchEnabled() {
    return booleanEnv('EARTH_SEARCH_ENABLED', true);
  },
  get smtpServer() {
    return optionalEnv('SMTP_SERVER');
  },
  get smtpPort() {
    return process.env.SMTP_SERVER ? optionalNumberEnv('SMTP_PORT', 587) : undefined;
  },
  get smtpUsername() {
    return optionalEnv('SMTP_USERNAME');
  },
  get smtpPassword() {
    return optionalEnv('SMTP_PASSWORD');
  },
};
