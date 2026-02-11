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
import { PostgresCompensationHistoryRepository } from './infrastructure/persistence/postgres/compensation-history-repository';
import { PostgresCompensationCertificateRepository } from './infrastructure/persistence/postgres/compensation-certificate-repository';
import { PostgresPaymentStore } from './infrastructure/persistence/postgres/payment-simulation-store';
import { CardSimulatorPaymentGatewayAdapter } from './infrastructure/payments/card-simulator-gateway';
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
import { LocalCertificateStorage } from './infrastructure/storage/local-certificate-storage';
import {
  S3CompatibleObjectStorage,
  type S3CompatibleConfig,
} from './infrastructure/storage/s3-compatible-object-storage';
import { S3AreaMediaStorage } from './infrastructure/storage/s3-area-media-storage';
import { S3CertificateStorage } from './infrastructure/storage/s3-certificate-storage';
import { SimpleCertificatePdfGenerator } from './infrastructure/pdf/simple-certificate-pdf-generator';
import { logger } from './shared/utils/logger';
import type { AreaMediaStorage } from './domain/areas/services/area-media-storage';
import type { CompensationCertificateStorage } from './domain/compensations/services/certificate-storage';

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

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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
const compensationHistoryRepository = new PostgresCompensationHistoryRepository(pgPool);
const compensationCertificateRepository = new PostgresCompensationCertificateRepository(pgPool);
const paymentStore = new PostgresPaymentStore(pgPool);
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
const paymentWebhookSecret =
  process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-payment-webhook-secret';
const paymentGateway = new CardSimulatorPaymentGatewayAdapter({
  clock,
  webhookSecret: paymentWebhookSecret,
});
const objectStorageDriver = (process.env.OBJECT_STORAGE_DRIVER ?? 'local')
  .trim()
  .toLowerCase();

let areaMediaStorage: AreaMediaStorage;
let compensationCertificateStorage: CompensationCertificateStorage;

if (objectStorageDriver === 's3') {
  const s3Config: S3CompatibleConfig = {
    endpoint: requiredEnv('S3_ENDPOINT'),
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: requiredEnv('S3_BUCKET'),
    accessKeyId: requiredEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('S3_SECRET_ACCESS_KEY'),
    sessionToken: process.env.S3_SESSION_TOKEN,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true')
      .toLowerCase()
      .trim() !== 'false',
  };

  const objectStorage = new S3CompatibleObjectStorage(s3Config);
  areaMediaStorage = new S3AreaMediaStorage(
    objectStorage,
    process.env.S3_AREA_MEDIA_PREFIX ?? 'area-media'
  );
  compensationCertificateStorage = new S3CertificateStorage(
    objectStorage,
    process.env.S3_CERTIFICATE_PREFIX ?? 'certificates'
  );
  logger.info('storage.object.configured', {
    driver: 's3',
    endpoint: s3Config.endpoint,
    bucket: s3Config.bucket,
    region: s3Config.region,
    force_path_style: s3Config.forcePathStyle,
  });
} else {
  areaMediaStorage = new LocalAreaMediaStorage();
  compensationCertificateStorage = new LocalCertificateStorage();
  logger.info('storage.object.configured', { driver: 'local' });
}

const compensationCertificatePdfGenerator = new SimpleCertificatePdfGenerator();
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
  compensationHistoryRepository,
  compensationCertificateRepository,
  paymentStore,
  paymentGateway,
  compensationCertificateStorage,
  compensationCertificatePdfGenerator,
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
      fetch: (request, server) => {
        const clientIp = server.requestIP(request)?.address;
        return router.handle(request, { clientIp });
      }
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
