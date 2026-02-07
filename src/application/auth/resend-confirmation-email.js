export async function resendConfirmationEmail(input, deps) {
    const user = await deps.users.findByEmail(input.email);
    if (!user || user.deletedAt || user.status !== 'pending') {
        return { delivered: false };
    }
    const rawToken = deps.tokenGenerator.generate();
    const tokenHash = await deps.hashService.sha256(rawToken);
    const now = deps.clock.now();
    const expiresAt = new Date(now.getTime() + deps.config.emailConfirmTtlMinutes * 60 * 1000);
    await deps.confirmations.create({
        id: deps.idGenerator.generate(),
        userId: user.id,
        tokenHash,
        sentAt: now,
        expiresAt,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
    });
    const confirmUrl = `${deps.config.frontendUrl}/confirm-email?token=${rawToken}`;
    await deps.emailSender.send({
        to: user.email,
        subject: 'Confirm your email',
        text: `Confirm your email: ${confirmUrl}`
    });
    return { delivered: true };
}
