import { InvalidTokenError, TokenExpiredError } from '../../domain/errors';
export async function refreshAccessToken(input, deps) {
    const tokenHash = await deps.hashService.sha256(input.refreshToken);
    const stored = await deps.refreshTokens.findByTokenHash(tokenHash);
    if (!stored) {
        throw new InvalidTokenError('refresh token not found');
    }
    if (stored.revokedAt) {
        throw new InvalidTokenError('refresh token revoked');
    }
    const now = deps.clock.now();
    if (stored.expiresAt < now) {
        throw new TokenExpiredError(stored.expiresAt);
    }
    // Revoke the old refresh token (rotation)
    await deps.refreshTokens.revoke(stored.id, now);
    // Get user roles for new access token
    const roles = await deps.users.getRoles(stored.userId);
    // Issue new access token
    const nowSec = Math.floor(now.getTime() / 1000);
    const accessPayload = {
        sub: stored.userId,
        roles,
        iss: deps.config.jwtIssuer,
        aud: deps.config.jwtAudience,
        iat: nowSec,
        exp: nowSec + deps.config.jwtTtlSeconds,
    };
    const accessToken = await deps.jwtService.sign(accessPayload, deps.config.jwtSecret);
    // Issue new refresh token
    const newRawToken = deps.tokenGenerator.generate();
    const newTokenHash = await deps.hashService.sha256(newRawToken);
    const refreshTtlSeconds = deps.config.refreshTokenTtlDays * 86400;
    const refreshExpiresAt = new Date(now.getTime() + refreshTtlSeconds * 1000);
    await deps.refreshTokens.create({
        id: deps.idGenerator.generate(),
        userId: stored.userId,
        tokenHash: newTokenHash,
        expiresAt: refreshExpiresAt,
        createdAt: now,
        updatedAt: now,
    });
    return {
        accessToken,
        refreshToken: newRawToken,
        tokenType: 'Bearer',
        expiresIn: deps.config.jwtTtlSeconds,
        refreshExpiresIn: refreshTtlSeconds,
    };
}
