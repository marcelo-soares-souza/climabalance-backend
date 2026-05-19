import type { EmailConfirmationRepository } from "../../domain/user/email-confirmation-repository";
import type { UserRepository } from "../../domain/user/user-repository";
import type { HashService } from "../../domain/services/hash-service";
import type { Clock } from "../../domain/services/clock";
import {
  InvalidTokenError,
  TokenAlreadyUsedError,
  TokenExpiredError,
} from "../../domain/errors";

export async function confirmEmail(
  token: string,
  deps: {
    confirmations: EmailConfirmationRepository;
    users: UserRepository;
    hashService: HashService;
    clock: Clock;
  },
): Promise<{ userId: string }> {
  const tokenHash = await deps.hashService.sha256(token);
  const record = await deps.confirmations.findByTokenHash(tokenHash);
  if (!record || record.deletedAt) {
    throw new InvalidTokenError("confirmation token not found");
  }
  if (record.confirmedAt) {
    throw new TokenAlreadyUsedError(record.confirmedAt);
  }
  if (record.expiresAt.getTime() < deps.clock.now().getTime()) {
    throw new TokenExpiredError(record.expiresAt);
  }

  const confirmedAt = deps.clock.now();
  await deps.confirmations.markConfirmed(record.id, confirmedAt);

  await deps.users.update({
    id: record.userId,
    emailConfirmedAt: confirmedAt,
    status: "active",
  });

  return { userId: record.userId };
}
