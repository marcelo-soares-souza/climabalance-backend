import { InvalidCredentialsError, EmailNotConfirmedError, UserNotActiveError } from '../../domain/errors';
export async function authenticateUser(input, deps) {
    const user = await deps.users.findByEmail(input.email);
    if (!user || user.deletedAt) {
        throw new InvalidCredentialsError();
    }
    if (!user.emailConfirmedAt) {
        throw new EmailNotConfirmedError(input.email);
    }
    if (user.status !== 'active') {
        throw new UserNotActiveError(user.id);
    }
    const valid = await deps.passwordHasher.verify(input.password, user.passwordHash);
    if (!valid) {
        throw new InvalidCredentialsError();
    }
    const roles = await deps.users.getRoles(user.id);
    const now = deps.clock.now();
    const nowSec = Math.floor(now.getTime() / 1000);
    const payload = {
        sub: user.id,
        roles,
        iss: deps.config.jwtIssuer,
        aud: deps.config.jwtAudience,
        iat: nowSec,
        exp: nowSec + deps.config.jwtTtlSeconds
    };
    const accessToken = await deps.jwtService.sign(payload, deps.config.jwtSecret);
    // Issue refresh token
    const rawRefreshToken = deps.tokenGenerator.generate();
    const refreshTokenHash = await deps.hashService.sha256(rawRefreshToken);
    const refreshTtlSeconds = deps.config.refreshTokenTtlDays * 86400;
    const refreshExpiresAt = new Date(now.getTime() + refreshTtlSeconds * 1000);
    await deps.refreshTokens.create({
        id: deps.idGenerator.generate(),
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: refreshExpiresAt,
        createdAt: now,
        updatedAt: now,
    });
    return {
        userId: user.id,
        accessToken,
        refreshToken: rawRefreshToken,
        tokenType: 'Bearer',
        expiresIn: deps.config.jwtTtlSeconds,
        refreshExpiresIn: refreshTtlSeconds,
    };
}
