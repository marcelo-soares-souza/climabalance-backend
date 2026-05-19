import type { PasswordResetRepository } from "../../domain/user/password-reset-repository";
import type { UserRepository } from "../../domain/user/user-repository";
import type { PasswordHasher } from "../../infrastructure/crypto/password";
import type { HashService } from "../../domain/services/hash-service";
import type { Clock } from "../../domain/services/clock";
import {
  InvalidTokenError,
  TokenAlreadyUsedError,
  TokenExpiredError,
} from "../../domain/errors";

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
    hashService: HashService;
    clock: Clock;
  },
): Promise<{ userId: string }> {
  const tokenHash = await deps.hashService.sha256(input.token);
  const record = await deps.passwordResets.findByTokenHash(tokenHash);
  if (!record || record.deletedAt) {
    throw new InvalidTokenError("password reset token not found");
  }
  if (record.usedAt) {
    throw new TokenAlreadyUsedError(record.usedAt);
  }
  if (record.expiresAt.getTime() < deps.clock.now().getTime()) {
    throw new TokenExpiredError(record.expiresAt);
  }

  const user = await deps.users.findById(record.userId);
  if (!user || user.deletedAt) {
    throw new InvalidTokenError("user not found for token");
  }

  const passwordHash = await deps.passwordHasher.hash(input.password);
  await deps.users.update({ id: user.id, passwordHash });
  await deps.passwordResets.markUsed(record.id, deps.clock.now());

  return { userId: user.id };
}
