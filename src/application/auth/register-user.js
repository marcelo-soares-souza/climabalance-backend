import { EmailAlreadyExistsError } from '../../domain/errors';
export async function registerUser(input, deps) {
    // Check for existing user outside transaction (read-only)
    const existing = await deps.users.findByEmail(input.email);
    if (existing && !existing.deletedAt) {
        throw new EmailAlreadyExistsError(input.email);
    }
    // All write operations inside transaction
    const { user, rawToken } = await deps.unitOfWork.execute(async (tx) => {
        const usersRepo = tx.getUserRepository();
        const confirmationsRepo = tx.getEmailConfirmationRepository();
        const id = deps.idGenerator.generate();
        const passwordHash = await deps.passwordHasher.hash(input.password);
        const user = await usersRepo.create({
            id,
            email: input.email,
            passwordHash,
            status: 'pending',
            locale: input.locale ?? 'pt-BR',
            emailConfirmedAt: null
        });
        await usersRepo.assignRole(user.id, input.roleKey ?? 'individual');
        const rawToken = deps.tokenGenerator.generate();
        const tokenHash = await deps.hashService.sha256(rawToken);
        const now = deps.clock.now();
        const expiresAt = new Date(now.getTime() + deps.config.emailConfirmTtlMinutes * 60 * 1000);
        await confirmationsRepo.create({
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
        return { user, rawToken };
    });
    // External side effects after transaction (email)
    const confirmUrl = `${deps.config.frontendUrl}/confirm-email?token=${rawToken}`;
    await deps.emailSender.send({
        to: user.email,
        subject: 'Confirm your email',
        text: `Confirm your email: ${confirmUrl}`
    });
    return { id: user.id, email: user.email, status: user.status };
}
