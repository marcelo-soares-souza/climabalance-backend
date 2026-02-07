function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function numberValue(name, fallback) {
    const value = process.env[name];
    if (!value)
        return fallback;
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
        throw new Error(`Invalid number in environment variable: ${name}`);
    }
    return parsed;
}
/**
 * Implementation of Config using process.env.
 * Loads configuration from environment variables.
 */
export class EnvironmentConfig {
    jwtSecret;
    jwtIssuer;
    jwtAudience;
    jwtTtlSeconds;
    emailConfirmTtlMinutes;
    passwordResetTtlMinutes;
    refreshTokenTtlDays;
    frontendUrl;
    constructor() {
        this.jwtSecret = required('JWT_SECRET');
        this.jwtIssuer = process.env.JWT_ISSUER ?? 'centrobrasilnoclima';
        this.jwtAudience = process.env.JWT_AUDIENCE ?? 'centrobrasilnoclima-api';
        this.jwtTtlSeconds = numberValue('JWT_TTL_SECONDS', 900);
        this.emailConfirmTtlMinutes = numberValue('EMAIL_CONFIRM_TTL_MINUTES', 60);
        this.passwordResetTtlMinutes = numberValue('PASSWORD_RESET_TTL_MINUTES', 60);
        this.refreshTokenTtlDays = numberValue('REFRESH_TOKEN_TTL_DAYS', 7);
        this.frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    }
}
