import type { UserRepository } from '../../domain/user/user-repository';
import type { RefreshTokenRepository } from '../../domain/user/refresh-token-repository';
import type { PasswordHasher } from '../../infrastructure/crypto/password';
import type { JwtService } from '../../domain/services/jwt-service';
import type { HashService } from '../../domain/services/hash-service';
import type { TokenGenerator } from '../../domain/services/token-generator';
import type { IdGenerator } from '../../domain/services/id-generator';
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
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
};

export async function authenticateUser(
  input: AuthenticateInput,
  deps: {
    users: UserRepository;
    refreshTokens: RefreshTokenRepository;
    passwordHasher: PasswordHasher;
    jwtService: JwtService;
    hashService: HashService;
    tokenGenerator: TokenGenerator;
    idGenerator: IdGenerator;
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

  await deps.users.updateLastLogin(user.id, deps.clock.now());

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
