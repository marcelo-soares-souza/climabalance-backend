import { env } from './shared/utils/env';
import { buildRouter } from './infrastructure/http/routes';
import { PostgresUserRepository } from './infrastructure/persistence/postgres/user-repository';
import { PostgresEmailConfirmationRepository } from './infrastructure/persistence/postgres/email-confirmation-repository';
import { PostgresPasswordResetRepository } from './infrastructure/persistence/postgres/password-reset-repository';
import { bunPasswordHasher } from './infrastructure/crypto/password';
import { ConsoleEmailSender } from './infrastructure/email/console-email-sender';
import { SMTPEmailSender } from './infrastructure/email/smtp-email-sender';
import type { EmailSender } from './infrastructure/email/email-sender';
import { logger } from './shared/utils/logger';

const userRepository = new PostgresUserRepository();
const emailConfirmationRepository = new PostgresEmailConfirmationRepository();
const passwordResetRepository = new PostgresPasswordResetRepository();

let emailSender: EmailSender;
if (['production', 'staging'].includes(env.appEnv)) {
  if (!env.smtpServer || !env.smtpPort || !env.smtpUsername || !env.smtpPassword) {
    throw new Error('SMTP configuration required for production/staging environments');
  }
  emailSender = new SMTPEmailSender({
    host: env.smtpServer,
    port: env.smtpPort,
    auth: {
      user: env.smtpUsername,
      pass: env.smtpPassword
    },
    from: env.emailFrom
  });
  logger.info('email.configured', { provider: 'smtp', host: env.smtpServer });
} else {
  emailSender = new ConsoleEmailSender();
  logger.info('email.configured', { provider: 'console' });
}

const router = buildRouter({
  users: userRepository,
  confirmations: emailConfirmationRepository,
  passwordResets: passwordResetRepository,
  passwordHasher: bunPasswordHasher,
  emailSender
});

Bun.serve({
  port: env.appPort,
  fetch: (request) => router.handle(request)
});

logger.info('server.started', { url: env.appUrl, port: env.appPort });
