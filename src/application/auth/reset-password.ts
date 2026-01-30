import type { PasswordResetRepository } from '../../domain/user/password-reset-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import type { PasswordHasher } from '../../infrastructure/crypto/password';
import { sha256Hex } from '../../shared/utils/crypto';

export type ResetPasswordInput = {
  token: string;
  password: string;
};

export async function resetPassword(
  input: ResetPasswordInput,
  deps: {
    passwordResets: PasswordResetRepository;
    users: UserRepository;
    passwordHasher: PasswordHasher;
  }
): Promise<{ userId: string }> {
  const tokenHash = await sha256Hex(input.token);
  const record = await deps.passwordResets.findByTokenHash(tokenHash);
  if (!record || record.deletedAt) {
    throw new Error('invalid_token');
  }
  if (record.usedAt) {
    throw new Error('token_already_used');
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw new Error('token_expired');
  }

  const user = await deps.users.findById(record.userId);
  if (!user || user.deletedAt) {
    throw new Error('invalid_token');
  }

  const passwordHash = await deps.passwordHasher.hash(input.password);
  await deps.users.update({ id: user.id, passwordHash });
  await deps.passwordResets.markUsed(record.id, new Date());

  return { userId: user.id };
}
