import type { UserRepository } from '../../domain/user/user-repository';
import type { PasswordResetRepository } from '../../domain/user/password-reset-repository';
import type { EmailSender } from '../../infrastructure/email/email-sender';
import { env } from '../../shared/utils/env';
import { uuidv7 } from '../../shared/utils/id';
import { sha256Hex } from '../../shared/utils/crypto';
import { generateToken } from '../../infrastructure/crypto/token';

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
  }
): Promise<RequestPasswordResetResult> {
  const user = await deps.users.findByEmail(input.email);
  if (!user || user.deletedAt) {
    return { delivered: false };
  }

  const rawToken = generateToken();
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.passwordResetTtlMinutes * 60 * 1000);
  await deps.passwordResets.create({
    id: uuidv7(),
    userId: user.id,
    tokenHash,
    sentAt: now,
    expiresAt,
    usedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  });

  const resetUrl = `${env.frontendUrl}/password-reset/confirm?token=${rawToken}`;
  await deps.emailSender.send({
    to: user.email,
    subject: 'Reset your password',
    text: `Reset your password: ${resetUrl}`
  });

  return { delivered: true };
}
