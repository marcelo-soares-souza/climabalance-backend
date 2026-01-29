import { env } from './shared/utils/env';
import { buildRouter } from './infrastructure/http/routes';
import { PostgresUserRepository } from './infrastructure/persistence/postgres/user-repository';
import { PostgresEmailConfirmationRepository } from './infrastructure/persistence/postgres/email-confirmation-repository';
import { bunPasswordHasher } from './infrastructure/crypto/password';
import { ConsoleEmailSender } from './infrastructure/email/console-email-sender';
import { logger } from './shared/utils/logger';

const userRepository = new PostgresUserRepository();
const emailConfirmationRepository = new PostgresEmailConfirmationRepository();
const emailSender = new ConsoleEmailSender();

const router = buildRouter({
  users: userRepository,
  confirmations: emailConfirmationRepository,
  passwordHasher: bunPasswordHasher,
  emailSender
});

Bun.serve({
  port: env.appPort,
  fetch: (request) => router.handle(request)
});

logger.info('server.started', { url: env.appUrl, port: env.appPort });
