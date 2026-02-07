import { buildRouter } from './infrastructure/http/routes';
import { PostgresUserRepository } from './infrastructure/persistence/postgres/user-repository';
import { PostgresEmailConfirmationRepository } from './infrastructure/persistence/postgres/email-confirmation-repository';
import { PostgresPasswordResetRepository } from './infrastructure/persistence/postgres/password-reset-repository';
import { PostgresRefreshTokenRepository } from './infrastructure/persistence/postgres/refresh-token-repository';
import { PostgresAuditLogRepository } from './infrastructure/persistence/postgres/audit-log-repository';
import { PostgresUnitOfWork } from './infrastructure/persistence/postgres/postgres-unit-of-work';
import { PostgresFootprintCalculationRepository } from './infrastructure/persistence/postgres/footprint-calculation-repository';
import { PostgresEmissionFactorRepository } from './infrastructure/persistence/postgres/emission-factor-repository';
import { PostgresFootprintInputRepository } from './infrastructure/persistence/postgres/footprint-input-repository';
import { PostgresFootprintBreakdownRepository } from './infrastructure/persistence/postgres/footprint-breakdown-repository';
import { PostgresCompensationProjectionRepository } from './infrastructure/persistence/postgres/compensation-projection-repository';
import { PostgresAreaRepository } from './infrastructure/persistence/postgres/area-repository';
import { PostgresAreaCriteriaRepository } from './infrastructure/persistence/postgres/area-criteria-repository';
import { PostgresAreaMediaRepository } from './infrastructure/persistence/postgres/area-media-repository';
import { PostgresCompensationAtomicStore } from './infrastructure/persistence/postgres/compensation-atomic-store';
import { pgPool } from './infrastructure/persistence/postgres/pg-client';
import { bunPasswordHasher } from './infrastructure/crypto/password';
import { ConsoleEmailSender } from './infrastructure/email/console-email-sender';
import { SMTPEmailSender } from './infrastructure/email/smtp-email-sender';
import type { EmailSender } from './infrastructure/email/email-sender';
import { CryptoTokenGenerator } from './infrastructure/crypto/crypto-token-generator';
import { HS256JwtService } from './infrastructure/crypto/hs256-jwt-service';
import { WebCryptoHashService } from './infrastructure/crypto/web-crypto-hash-service';
import { UUIDv7Generator } from './infrastructure/id/uuidv7-generator';
import { SystemClock } from './infrastructure/time/system-clock';
import { EnvironmentConfig } from './infrastructure/config/environment-config';
import { LocalAreaMediaStorage } from './infrastructure/storage/local-area-media-storage';
import { logger } from './shared/utils/logger';

// Verify database connectivity on startup
async function verifyDatabaseConnection(): Promise<void> {
  try {
    logger.info('startup.database.connecting');
    const client = await pgPool.connect();
    await client.query('SELECT 1');
    client.release();
    logger.info('startup.database.connected');
  } catch (error) {
    logger.error('startup.database.connection_failed', {
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof Error && 'code' in error ? (error as any).code : undefined
    });
    throw error;
  }
}

logger.info('startup.initializing');

// Infrastructure - Repositories
logger.debug('startup.repositories.initializing');
const userRepository = new PostgresUserRepository();
const emailConfirmationRepository = new PostgresEmailConfirmationRepository();
const passwordResetRepository = new PostgresPasswordResetRepository();
const refreshTokenRepository = new PostgresRefreshTokenRepository();
const auditLogRepository = new PostgresAuditLogRepository();
const footprintCalculationRepository = new PostgresFootprintCalculationRepository();
const emissionFactorRepository = new PostgresEmissionFactorRepository();
const footprintInputRepository = new PostgresFootprintInputRepository();
const footprintBreakdownRepository = new PostgresFootprintBreakdownRepository();
const compensationProjectionRepository = new PostgresCompensationProjectionRepository();
const areaRepository = new PostgresAreaRepository(pgPool);
const areaCriteriaRepository = new PostgresAreaCriteriaRepository(pgPool);
const areaMediaRepository = new PostgresAreaMediaRepository(pgPool);
const compensationStore = new PostgresCompensationAtomicStore(pgPool);
const unitOfWork = new PostgresUnitOfWork(pgPool);
logger.debug('startup.repositories.initialized');

// Infrastructure - Services
logger.debug('startup.services.initializing');
const config = new EnvironmentConfig();
const tokenGenerator = new CryptoTokenGenerator();
const jwtService = new HS256JwtService();
const hashService = new WebCryptoHashService();
const idGenerator = new UUIDv7Generator();
const clock = new SystemClock();
const areaMediaStorage = new LocalAreaMediaStorage();
logger.debug('startup.services.initialized');

// Infrastructure - Email
let emailSender: EmailSender;
const appEnv = process.env.APP_ENV ?? 'local';
if (['production', 'staging'].includes(appEnv)) {
  const smtpServer = process.env.SMTP_SERVER;
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const smtpUsername = process.env.SMTP_USERNAME;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const emailFrom = process.env.EMAIL_FROM;

  if (!smtpServer || !smtpPort || !smtpUsername || !smtpPassword || !emailFrom) {
    throw new Error('SMTP configuration required for production/staging environments');
  }

  emailSender = new SMTPEmailSender({
    host: smtpServer,
    port: smtpPort,
    auth: {
      user: smtpUsername,
      pass: smtpPassword
    },
    from: emailFrom
  });
  logger.info('email.configured', { provider: 'smtp', host: smtpServer });
} else {
  emailSender = new ConsoleEmailSender();
  logger.info('email.configured', { provider: 'console' });
}

// Build router with all dependencies
const router = buildRouter({
  users: userRepository,
  confirmations: emailConfirmationRepository,
  passwordResets: passwordResetRepository,
  refreshTokens: refreshTokenRepository,
  auditLog: auditLogRepository,
  calculationRepository: footprintCalculationRepository,
  emissionFactorRepository: emissionFactorRepository,
  inputRepository: footprintInputRepository,
  breakdownRepository: footprintBreakdownRepository,
  projectionRepository: compensationProjectionRepository,
  areaRepository: areaRepository,
  areaCriteriaRepository: areaCriteriaRepository,
  areaMediaRepository: areaMediaRepository,
  areaMediaStorage,
  compensationStore,
  passwordHasher: bunPasswordHasher,
  emailSender,
  unitOfWork,
  tokenGenerator,
  jwtService,
  hashService,
  idGenerator,
  clock,
  config
});

const appPort = process.env.APP_PORT ? Number(process.env.APP_PORT) : 3000;
const appUrl = process.env.APP_URL ?? `http://localhost:${appPort}`;

// Main startup sequence
async function main() {
  try {
    await verifyDatabaseConnection();

    logger.info('startup.server.starting', { port: appPort, url: appUrl });
    Bun.serve({
      port: appPort,
      fetch: (request) => router.handle(request)
    });

    logger.info('startup.complete', { url: appUrl, port: appPort });
  } catch (error) {
    logger.error('startup.failed', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

main();
