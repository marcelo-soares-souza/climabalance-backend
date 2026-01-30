import type { EmailConfirmationRepository } from '../../domain/user/email-confirmation-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import type { EmailSender } from '../../infrastructure/email/email-sender';
import { env } from '../../shared/utils/env';
import { uuidv7 } from '../../shared/utils/id';
import { sha256Hex } from '../../shared/utils/crypto';
import { generateToken } from '../../infrastructure/crypto/token';

export type ResendConfirmationEmailInput = {
  email: string;
};

export type ResendConfirmationEmailResult = {
  delivered: boolean;
};

export async function resendConfirmationEmail(
  input: ResendConfirmationEmailInput,
  deps: {
    users: UserRepository;
    confirmations: EmailConfirmationRepository;
    emailSender: EmailSender;
  }
): Promise<ResendConfirmationEmailResult> {
  const user = await deps.users.findByEmail(input.email);
  if (!user || user.deletedAt || user.status !== 'pending') {
    return { delivered: false };
  }

  const rawToken = generateToken();
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.emailConfirmTtlMinutes * 60 * 1000);
  await deps.confirmations.create({
    id: uuidv7(),
    userId: user.id,
    tokenHash,
    sentAt: now,
    expiresAt,
    confirmedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  });

  const confirmUrl = `${env.frontendUrl}/confirm-email?token=${rawToken}`;
  await deps.emailSender.send({
    to: user.email,
    subject: 'Confirm your email',
    text: `Confirm your email: ${confirmUrl}`
  });

  return { delivered: true };
}
