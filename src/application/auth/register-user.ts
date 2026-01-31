import type { EmailConfirmationRepository } from '../../domain/user/email-confirmation-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import type { EmailSender } from '../../infrastructure/email/email-sender';
import type { PasswordHasher } from '../../infrastructure/crypto/password';
import type { UnitOfWork } from '../../infrastructure/persistence/unit-of-work';
import type { TokenGenerator } from '../../domain/services/token-generator';
import type { HashService } from '../../domain/services/hash-service';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import type { Config } from '../../domain/services/config';
import { EmailAlreadyExistsError } from '../../domain/errors';

export type RegisterUserInput = {
  email: string;
  password: string;
  locale?: string;
  roleKey?: string;
};

export type RegisterUserResult = {
  id: string;
  email: string;
  status: string;
};

export async function registerUser(
  input: RegisterUserInput,
  deps: {
    users: UserRepository;
    confirmations: EmailConfirmationRepository;
    passwordHasher: PasswordHasher;
    emailSender: EmailSender;
    unitOfWork: UnitOfWork;
    tokenGenerator: TokenGenerator;
    hashService: HashService;
    idGenerator: IdGenerator;
    clock: Clock;
    config: Config;
  }
): Promise<RegisterUserResult> {
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
