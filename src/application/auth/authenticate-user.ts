import type { UserRepository } from '../../domain/user/user-repository';
import type { PasswordHasher } from '../../infrastructure/crypto/password';
import type { JwtService } from '../../domain/services/jwt-service';
import type { Clock } from '../../domain/services/clock';
import type { Config } from '../../domain/services/config';
import {
  InvalidCredentialsError,
  EmailNotConfirmedError,
  UserNotActiveError
} from '../../domain/errors';

export type AuthenticateInput = {
  email: string;
  password: string;
};

export type AuthenticateResult = {
  userId: string;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
};

export async function authenticateUser(
  input: AuthenticateInput,
  deps: {
    users: UserRepository;
    passwordHasher: PasswordHasher;
    jwtService: JwtService;
    clock: Clock;
    config: Config;
  }
): Promise<AuthenticateResult> {
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
  const now = Math.floor(deps.clock.now().getTime() / 1000);
  const payload = {
    sub: user.id,
    roles,
    iss: deps.config.jwtIssuer,
    aud: deps.config.jwtAudience,
    iat: now,
    exp: now + deps.config.jwtTtlSeconds
  };

  const accessToken = await deps.jwtService.sign(payload, deps.config.jwtSecret);

  return {
    userId: user.id,
    accessToken,
    tokenType: 'Bearer',
    expiresIn: deps.config.jwtTtlSeconds
  };
}
