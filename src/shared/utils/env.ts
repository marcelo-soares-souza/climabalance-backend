export type Env = {
  appEnv: string;
  appPort: number;
  appUrl: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtTtlSeconds: number;
  passwordPepper: string;
  emailFrom: string;
  emailConfirmTtlMinutes: number;
  passwordResetTtlMinutes: number;
  smtpServer?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function numberValue(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number env: ${name}`);
  }
  return parsed;
}

export const env: Env = {
  appEnv: process.env.APP_ENV ?? 'local',
  appPort: numberValue('APP_PORT', 3000),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtIssuer: process.env.JWT_ISSUER ?? 'centrobrasilnoclima',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'centrobrasilnoclima-api',
  jwtTtlSeconds: numberValue('JWT_TTL_SECONDS', 900),
  passwordPepper: required('PASSWORD_PEPPER'),
  emailFrom: required('EMAIL_FROM'),
  emailConfirmTtlMinutes: numberValue('EMAIL_CONFIRM_TTL_MINUTES', 60),
  passwordResetTtlMinutes: numberValue('PASSWORD_RESET_TTL_MINUTES', 60),
  ...(process.env.SMTP_SERVER && { smtpServer: process.env.SMTP_SERVER }),
  ...(process.env.SMTP_PORT && { smtpPort: numberValue('SMTP_PORT', 587) }),
  ...(process.env.SMTP_USERNAME && { smtpUsername: process.env.SMTP_USERNAME }),
  ...(process.env.SMTP_PASSWORD && { smtpPassword: process.env.SMTP_PASSWORD })
};
