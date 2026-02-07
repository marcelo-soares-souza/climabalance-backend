import { InvalidTokenError, TokenAlreadyUsedError, TokenExpiredError } from '../../domain/errors';
export async function resetPassword(input, deps) {
    const tokenHash = await deps.hashService.sha256(input.token);
    const record = await deps.passwordResets.findByTokenHash(tokenHash);
    if (!record || record.deletedAt) {
        throw new InvalidTokenError('password reset token not found');
    }
    if (record.usedAt) {
        throw new TokenAlreadyUsedError(record.usedAt);
    }
    if (record.expiresAt.getTime() < deps.clock.now().getTime()) {
        throw new TokenExpiredError(record.expiresAt);
    }
    const user = await deps.users.findById(record.userId);
    if (!user || user.deletedAt) {
        throw new InvalidTokenError('user not found for token');
    }
    const passwordHash = await deps.passwordHasher.hash(input.password);
    await deps.users.update({ id: user.id, passwordHash });
    await deps.passwordResets.markUsed(record.id, deps.clock.now());
    return { userId: user.id };
}
