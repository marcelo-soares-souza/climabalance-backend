import type { EmailConfirmationRepository } from '../../domain/user/email-confirmation-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import type { EmailSender } from '../../infrastructure/email/email-sender';
import type { PasswordHasher } from '../../infrastructure/crypto/password';
import { env } from '../../shared/utils/env';
import { uuidv7 } from '../../shared/utils/id';
import { sha256Hex } from '../../shared/utils/crypto';
import { generateToken } from '../../infrastructure/crypto/token';

export type RegisterUserInput = {
  email: string;
  password: string;
  locale?: string;
  roleKey?: string;
};

export type RegisterUserResult = {
  id: string;
  email: string;
  status: string;
};

export async function registerUser(
  input: RegisterUserInput,
  deps: {
    users: UserRepository;
    confirmations: EmailConfirmationRepository;
    passwordHasher: PasswordHasher;
    emailSender: EmailSender;
  }
): Promise<RegisterUserResult> {
  const existing = await deps.users.findByEmail(input.email);
  if (existing && !existing.deletedAt) {
    throw new Error('email_already_exists');
  }

  const id = uuidv7();
  const passwordHash = await deps.passwordHasher.hash(input.password);
  const user = await deps.users.create({
    id,
    email: input.email,
    passwordHash,
    status: 'pending',
    locale: input.locale ?? 'pt-BR',
    emailConfirmedAt: null
  });

  await deps.users.assignRole(user.id, input.roleKey ?? 'individual');

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

  const confirmUrl = `${env.appUrl}/confirm-email?token=${rawToken}`;
  await deps.emailSender.send({
    to: user.email,
    subject: 'Confirm your email',
    text: `Confirm your email: ${confirmUrl}`
  });

  return { id: user.id, email: user.email, status: user.status };
}
