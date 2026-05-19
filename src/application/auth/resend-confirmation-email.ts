import type { EmailConfirmationRepository } from "../../domain/user/email-confirmation-repository";
import type { UserRepository } from "../../domain/user/user-repository";
import type { EmailSender } from "../../infrastructure/email/email-sender";
import type { TokenGenerator } from "../../domain/services/token-generator";
import type { HashService } from "../../domain/services/hash-service";
import type { IdGenerator } from "../../domain/services/id-generator";
import type { Clock } from "../../domain/services/clock";
import type { Config } from "../../domain/services/config";
import { buildConfirmationEmail } from "../../infrastructure/email/templates";

export type ResendConfirmationEmailInput = {
  email: string;
};

export type ResendConfirmationEmailResult = {
  delivered: boolean;
};

export async function resendConfirmationEmail(
  input: ResendConfirmationEmailInput,
  deps: {
    users: UserRepository;
    confirmations: EmailConfirmationRepository;
    emailSender: EmailSender;
    tokenGenerator: TokenGenerator;
    hashService: HashService;
    idGenerator: IdGenerator;
    clock: Clock;
    config: Config;
  },
): Promise<ResendConfirmationEmailResult> {
  const user = await deps.users.findByEmail(input.email);
  if (!user || user.deletedAt || user.status !== "pending") {
    return { delivered: false };
  }

  const rawToken = deps.tokenGenerator.generate();
  const tokenHash = await deps.hashService.sha256(rawToken);
  const now = deps.clock.now();
  const expiresAt = new Date(
    now.getTime() + deps.config.emailConfirmTtlMinutes * 60 * 1000,
  );
  await deps.confirmations.create({
    id: deps.idGenerator.generate(),
    userId: user.id,
    tokenHash,
    sentAt: now,
    expiresAt,
    confirmedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  const confirmUrl = `${deps.config.frontendUrl}/confirm-email?token=${rawToken}`;
  await deps.emailSender.send(
    buildConfirmationEmail(user.locale, user.email, confirmUrl),
  );

  return { delivered: true };
}
