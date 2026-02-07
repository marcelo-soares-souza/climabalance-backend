export async function requestPasswordReset(input, deps) {
    const user = await deps.users.findByEmail(input.email);
    if (!user || user.deletedAt) {
        return { delivered: false };
    }
    const rawToken = deps.tokenGenerator.generate();
    const tokenHash = await deps.hashService.sha256(rawToken);
    const now = deps.clock.now();
    const expiresAt = new Date(now.getTime() + deps.config.passwordResetTtlMinutes * 60 * 1000);
    await deps.passwordResets.create({
        id: deps.idGenerator.generate(),
        userId: user.id,
        tokenHash,
        sentAt: now,
        expiresAt,
        usedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
    });
    const resetUrl = `${deps.config.frontendUrl}/password-reset/confirm?token=${rawToken}`;
    await deps.emailSender.send({
        to: user.email,
        subject: 'Reset your password',
        text: `Reset your password: ${resetUrl}`
    });
    return { delivered: true };
}
