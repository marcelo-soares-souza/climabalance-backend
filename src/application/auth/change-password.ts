import type { UserRepository } from "../../domain/user/user-repository";
import type { RefreshTokenRepository } from "../../domain/user/refresh-token-repository";
import type { PasswordHasher } from "../../infrastructure/crypto/password";
import type { Clock } from "../../domain/services/clock";
import { InvalidCredentialsError } from "../../domain/errors";

export type ChangePasswordInput = {
  userId: string;
  oldPassword: string;
  newPassword: string;
};

export async function changePassword(
  input: ChangePasswordInput,
  deps: {
    users: UserRepository;
    refreshTokens: RefreshTokenRepository;
    passwordHasher: PasswordHasher;
    clock: Clock;
  },
): Promise<void> {
  const user = await deps.users.findById(input.userId);
  if (!user || !user.passwordHash) {
    throw new InvalidCredentialsError();
  }

  const isValid = await deps.passwordHasher.verify(
    input.oldPassword,
    user.passwordHash,
  );
  if (!isValid) {
    throw new InvalidCredentialsError();
  }

  const newHash = await deps.passwordHasher.hash(input.newPassword);
  await deps.users.update({ id: user.id, passwordHash: newHash });

  await deps.refreshTokens.revokeAllByUserId(user.id, deps.clock.now());
}
