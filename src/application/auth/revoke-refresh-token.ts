import type { RefreshTokenRepository } from "../../domain/user/refresh-token-repository";
import type { HashService } from "../../domain/services/hash-service";
import type { Clock } from "../../domain/services/clock";
import { InvalidTokenError } from "../../domain/errors";

export type RevokeRefreshTokenInput = {
  refreshToken: string;
};

export async function revokeRefreshToken(
  input: RevokeRefreshTokenInput,
  deps: {
    refreshTokens: RefreshTokenRepository;
    hashService: HashService;
    clock: Clock;
  },
): Promise<{ userId: string; tokenId: string } | null> {
  const tokenHash = await deps.hashService.sha256(input.refreshToken);
  const stored = await deps.refreshTokens.findByTokenHash(tokenHash);

  if (!stored) {
    throw new InvalidTokenError("refresh token not found");
  }

  if (stored.revokedAt) {
    return null; // Already revoked, idempotent
  }

  await deps.refreshTokens.revoke(stored.id, deps.clock.now());
  return { userId: stored.userId, tokenId: stored.id };
}
