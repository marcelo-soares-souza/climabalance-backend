import type { EmailConfirmationRepository } from '../../domain/user/email-confirmation-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import { sha256Hex } from '../../shared/utils/crypto';

export async function confirmEmail(
  token: string,
  deps: {
    confirmations: EmailConfirmationRepository;
    users: UserRepository;
  }
): Promise<{ userId: string }> {
  const tokenHash = await sha256Hex(token);
  const record = await deps.confirmations.findByTokenHash(tokenHash);
  if (!record || record.deletedAt) {
    throw new Error('invalid_token');
  }
  if (record.confirmedAt) {
    throw new Error('token_already_used');
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw new Error('token_expired');
  }

  const confirmedAt = new Date();
  await deps.confirmations.markConfirmed(record.id, confirmedAt);

  await deps.users.update({
    id: record.userId,
    emailConfirmedAt: confirmedAt,
    status: 'active'
  });

  return { userId: record.userId };
}
