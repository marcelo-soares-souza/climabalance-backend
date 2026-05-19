import type { EmailSender } from "../email/email-sender";
import { buildRouter } from "../http/routes";
import { EnvironmentConfig } from "../config/environment-config";
import { ConsoleEmailSender } from "../email/console-email-sender";
import { SMTPEmailSender } from "../email/smtp-email-sender";
import { LocalAreaMediaStorage } from "../storage/local-area-media-storage";
import { LocalCertificateStorage } from "../storage/local-certificate-storage";
import { LocalProfileAvatarStorage } from "../storage/local-profile-avatar-storage";
import { LocalSatelliteImageStorage } from "../storage/local-satellite-image-storage";
import { SimpleCertificatePdfGenerator } from "../pdf/simple-certificate-pdf-generator";
import { CardSimulatorPaymentGatewayAdapter } from "../payments/card-simulator-gateway";
import { StripePaymentGatewayAdapter } from "../payments/stripe-gateway";
import { getStripeClient } from "../payments/stripe-client";
import { PostgresUserRepository } from "../persistence/postgres/user-repository";
import { PostgresConsentRepository } from "../persistence/postgres/consent-repository";
import { PostgresEmailConfirmationRepository } from "../persistence/postgres/email-confirmation-repository";
import { PostgresPasswordResetRepository } from "../persistence/postgres/password-reset-repository";
import { PostgresRefreshTokenRepository } from "../persistence/postgres/refresh-token-repository";
import { PostgresAuditLogRepository } from "../persistence/postgres/audit-log-repository";
import { PostgresUnitOfWork } from "../persistence/postgres/postgres-unit-of-work";
import { PostgresFootprintCalculationRepository } from "../persistence/postgres/footprint-calculation-repository";
import { PostgresEmissionFactorRepository } from "../persistence/postgres/emission-factor-repository";
import { PostgresFootprintInputRepository } from "../persistence/postgres/footprint-input-repository";
import { PostgresFootprintBreakdownRepository } from "../persistence/postgres/footprint-breakdown-repository";
import { PostgresCompensationProjectionRepository } from "../persistence/postgres/compensation-projection-repository";
import { PostgresAreaRepository } from "../persistence/postgres/area-repository";
import { PostgresJobRepository } from "../persistence/postgres/job-repository";
import { startJobWorker } from "../jobs/worker";
import { PostgresAreaCriteriaRepository } from "../persistence/postgres/area-criteria-repository";
import { PostgresAreaMediaRepository } from "../persistence/postgres/area-media-repository";
import { PostgresAreaSatelliteImageRepository } from "../persistence/postgres/area-satellite-image-repository";
import { PostgresTreePlantingRepository } from "../persistence/postgres/tree-planting-repository";
import { PostgresCompensationAtomicStore } from "../persistence/postgres/compensation-atomic-store";
import { PostgresCompensationHistoryRepository } from "../persistence/postgres/compensation-history-repository";
import { PostgresCompensationCertificateRepository } from "../persistence/postgres/compensation-certificate-repository";
import { PostgresPaymentStore } from "../persistence/postgres/payment-simulation-store";
import { PostgresStripeConnectRepository } from "../persistence/postgres/stripe-connect-repository";
import { pgPool } from "../persistence/postgres/pg-client";
import { bunPasswordHasher } from "../crypto/password";
import { CryptoTokenGenerator } from "../crypto/crypto-token-generator";
import { HS256JwtService } from "../crypto/hs256-jwt-service";
import { WebCryptoHashService } from "../crypto/web-crypto-hash-service";
import { UUIDv7Generator } from "../id/uuidv7-generator";
import { SystemClock } from "../time/system-clock";
import type { AreaMediaStorage } from "../../domain/areas/services/area-media-storage";
import type { SatelliteImageStorage } from "../../domain/areas/services/satellite-image-storage";
import type { AreaSatelliteImageRepository } from "../../domain/areas/repositories/area-satellite-image-repository";
import type { CompensationCertificateStorage } from "../../domain/compensations/services/certificate-storage";
import { env } from "../../shared/utils/env";
import { buildAlertNotifier } from "../alerts/alert-notifier";

function createObjectStorage(): {
  areaMediaStorage: AreaMediaStorage;
  compensationCertificateStorage: CompensationCertificateStorage;
  satelliteImageStorage: SatelliteImageStorage;
  logMeta: Record<string, unknown>;
} {
  return {
    areaMediaStorage: new LocalAreaMediaStorage(env.areaMediaStoragePath),
    compensationCertificateStorage: new LocalCertificateStorage(
      env.certificateStoragePath,
    ),
    satelliteImageStorage: new LocalSatelliteImageStorage(
      env.satelliteImageStoragePath,
    ),
    logMeta: { driver: "local" },
  };
}

function createEmailSender(): EmailSender {
  if (env.appEnv === "production" || env.appEnv === "staging") {
    if (
      !env.smtpServer ||
      !env.smtpPort ||
      !env.smtpUsername ||
      !env.smtpPassword
    ) {
      throw new Error(
        "SMTP configuration required for production/staging environments",
      );
    }

    return new SMTPEmailSender({
      host: env.smtpServer,
      port: env.smtpPort,
      auth: {
        user: env.smtpUsername,
        pass: env.smtpPassword,
      },
      from: env.emailFrom,
    });
  }

  return new ConsoleEmailSender();
}

export function validateStripeConfiguration(useStripeGateway: boolean): void {
  if (!useStripeGateway) return;

  const missing: string[] = [];
  if (!env.stripeSecretKey.trim()) {
    missing.push("STRIPE_SECRET_KEY");
  }
  if (!env.stripeWebhookSecret.trim()) {
    missing.push("STRIPE_WEBHOOK_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(
      `Stripe configuration required when Stripe gateway is enabled: ${missing.join(", ")}`,
    );
  }
}

export function buildAppRuntime() {
  const config = new EnvironmentConfig();
  const tokenGenerator = new CryptoTokenGenerator();
  const jwtService = new HS256JwtService();
  const hashService = new WebCryptoHashService();
  const idGenerator = new UUIDv7Generator();
  const clock = new SystemClock();
  const useStripeGateway =
    env.appEnv !== "local" || env.stripeSecretKey.trim().length > 0;
  validateStripeConfiguration(useStripeGateway);
  const paymentGateway = useStripeGateway
    ? new StripePaymentGatewayAdapter({
        stripe: getStripeClient(env.stripeSecretKey),
        clock,
        webhookSecret: env.stripeWebhookSecret,
      })
    : new CardSimulatorPaymentGatewayAdapter({
        clock,
        webhookSecret: env.paymentWebhookSecret,
      });
  const {
    areaMediaStorage,
    compensationCertificateStorage,
    satelliteImageStorage,
    logMeta: storageLogMeta,
  } = createObjectStorage();
  const emailSender = createEmailSender();
  const compensationCertificatePdfGenerator =
    new SimpleCertificatePdfGenerator();
  const profileAvatarStorage = new LocalProfileAvatarStorage(
    env.profileAvatarStoragePath,
  );

  const userRepository = new PostgresUserRepository(pgPool);
  const consentRepository = new PostgresConsentRepository(pgPool);
  const emailConfirmationRepository = new PostgresEmailConfirmationRepository(
    pgPool,
  );
  const passwordResetRepository = new PostgresPasswordResetRepository(pgPool);
  const refreshTokenRepository = new PostgresRefreshTokenRepository(pgPool);
  const alertNotifier = buildAlertNotifier({
    alertEmailTo: env.alertEmailTo,
    alertWebhookUrl: env.alertWebhookUrl,
    emailSender: env.alertEmailTo ? emailSender : undefined,
  });
  const auditLogRepository = new PostgresAuditLogRepository(
    pgPool,
    alertNotifier ?? undefined,
  );
  const footprintCalculationRepository =
    new PostgresFootprintCalculationRepository(pgPool);
  const emissionFactorRepository = new PostgresEmissionFactorRepository(pgPool);
  const footprintInputRepository = new PostgresFootprintInputRepository(pgPool);
  const footprintBreakdownRepository = new PostgresFootprintBreakdownRepository(
    pgPool,
  );
  const compensationProjectionRepository =
    new PostgresCompensationProjectionRepository(pgPool);
  const areaRepository = new PostgresAreaRepository(pgPool);
  const areaCriteriaRepository = new PostgresAreaCriteriaRepository(pgPool);
  const areaMediaRepository = new PostgresAreaMediaRepository(pgPool);
  const areaSatelliteImageRepository: AreaSatelliteImageRepository =
    new PostgresAreaSatelliteImageRepository(pgPool);
  const treePlantingRepository = new PostgresTreePlantingRepository(pgPool);
  const compensationStore = new PostgresCompensationAtomicStore(pgPool);
  const compensationHistoryRepository =
    new PostgresCompensationHistoryRepository(pgPool);
  const compensationCertificateRepository =
    new PostgresCompensationCertificateRepository(pgPool);
  const paymentStore = new PostgresPaymentStore(pgPool);
  const stripeConnectRepository = new PostgresStripeConnectRepository(pgPool);
  const unitOfWork = new PostgresUnitOfWork(pgPool);
  const jobRepository = new PostgresJobRepository(pgPool);

  startJobWorker(
    jobRepository,
    {
      users: userRepository,
      emailSender,
      frontendUrl: env.frontendUrl,
    },
    auditLogRepository,
  );

  const router = buildRouter({
    users: userRepository,
    consents: consentRepository,
    confirmations: emailConfirmationRepository,
    passwordResets: passwordResetRepository,
    refreshTokens: refreshTokenRepository,
    auditLog: auditLogRepository,
    calculationRepository: footprintCalculationRepository,
    emissionFactorRepository,
    inputRepository: footprintInputRepository,
    breakdownRepository: footprintBreakdownRepository,
    projectionRepository: compensationProjectionRepository,
    areaRepository,
    areaCriteriaRepository,
    areaMediaRepository,
    areaMediaStorage,
    areaSatelliteImageRepository,
    satelliteImageStorage,
    treePlantingRepository,
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
    config,
    jobQueue: jobRepository,
    stripeConnectRepository,
    stripeConnectLookup: stripeConnectRepository,
    stripePlatformFeePercent: env.stripePlatformFeePercent,
    profileAvatarStorage,
    defaultMaxPurchasableTrees: env.defaultMaxPurchasableTrees,
    satelliteBboxSizeKm: env.satelliteBboxSizeKm,
    satelliteMaxCloud: env.satelliteMaxCloud,
    satelliteDaysBack: env.satelliteDaysBack,
    earthSearchEnabled: env.earthSearchEnabled,
  });

  return {
    router,
    port: env.appPort,
    url: env.appUrl,
    storageLogMeta,
    emailLogMeta:
      env.appEnv === "production" || env.appEnv === "staging"
        ? { provider: "smtp", host: env.smtpServer }
        : { provider: "console" },
  };
}
