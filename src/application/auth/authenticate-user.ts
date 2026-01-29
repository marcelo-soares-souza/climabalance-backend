import type { UserRepository } from '../../domain/user/user-repository';
import type { PasswordHasher } from '../../infrastructure/crypto/password';
import { env } from '../../shared/utils/env';
import { signJwt } from '../../infrastructure/crypto/jwt';

export type AuthenticateInput = {
  email: string;
  password: string;
};

export type AuthenticateResult = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
};

export async function authenticateUser(
  input: AuthenticateInput,
  deps: {
    users: UserRepository;
    passwordHasher: PasswordHasher;
  }
): Promise<AuthenticateResult> {
  const user = await deps.users.findByEmail(input.email);
  if (!user || user.deletedAt) {
    throw new Error('invalid_credentials');
  }
  if (!user.emailConfirmedAt) {
    throw new Error('email_not_confirmed');
  }
  if (user.status !== 'active') {
    throw new Error('user_not_active');
  }

  const valid = await deps.passwordHasher.verify(input.password, user.passwordHash);
  if (!valid) {
    throw new Error('invalid_credentials');
  }

  const roles = await deps.users.getRoles(user.id);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    roles,
    iss: env.jwtIssuer,
    aud: env.jwtAudience,
    iat: now,
    exp: now + env.jwtTtlSeconds
  };

  const accessToken = await signJwt(payload, env.jwtSecret);

  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: env.jwtTtlSeconds
  };
}
