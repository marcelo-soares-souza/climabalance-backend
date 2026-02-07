import { InvalidTokenError, TokenAlreadyUsedError, TokenExpiredError } from '../../domain/errors';
export async function confirmEmail(token, deps) {
    const tokenHash = await deps.hashService.sha256(token);
    const record = await deps.confirmations.findByTokenHash(tokenHash);
    if (!record || record.deletedAt) {
        throw new InvalidTokenError('confirmation token not found');
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
        status: 'active'
    });
    return { userId: record.userId };
}
