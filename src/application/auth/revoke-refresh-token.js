import { InvalidTokenError } from '../../domain/errors';
export async function revokeRefreshToken(input, deps) {
    const tokenHash = await deps.hashService.sha256(input.refreshToken);
    const stored = await deps.refreshTokens.findByTokenHash(tokenHash);
    if (!stored) {
        throw new InvalidTokenError('refresh token not found');
    }
    if (stored.revokedAt) {
        return; // Already revoked, idempotent
    }
    await deps.refreshTokens.revoke(stored.id, deps.clock.now());
}
