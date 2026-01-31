import type { UserRepository } from '../../domain/user/user-repository';
import type { PasswordResetRepository } from '../../domain/user/password-reset-repository';
import type { EmailSender } from '../../infrastructure/email/email-sender';
import type { TokenGenerator } from '../../domain/services/token-generator';
import type { HashService } from '../../domain/services/hash-service';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import type { Config } from '../../domain/services/config';

export type RequestPasswordResetInput = {
  email: string;
  locale?: string;
};

export type RequestPasswordResetResult = {
  delivered: boolean;
};

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
  deps: {
    users: UserRepository;
    passwordResets: PasswordResetRepository;
    emailSender: EmailSender;
    tokenGenerator: TokenGenerator;
    hashService: HashService;
    idGenerator: IdGenerator;
    clock: Clock;
    config: Config;
  }
): Promise<RequestPasswordResetResult> {
  const user = await deps.users.findByEmail(input.email);
  if (!user || user.deletedAt) {
    return { delivered: false };
  }

  const rawToken = deps.tokenGenerator.generate();
  const tokenHash = await deps.hashService.sha256(rawToken);
  const now = deps.clock.now();
  const expiresAt = new Date(now.getTime() + deps.config.passwordResetTtlMinutes * 60 * 1000);
  await deps.passwordResets.create({
    id: deps.idGenerator.generate(),
    userId: user.id,
    tokenHash,
    sentAt: now,
    expiresAt,
    usedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  });

  const resetUrl = `${deps.config.frontendUrl}/password-reset/confirm?token=${rawToken}`;
  await deps.emailSender.send({
    to: user.email,
    subject: 'Reset your password',
    text: `Reset your password: ${resetUrl}`
  });

  return { delivered: true };
}
