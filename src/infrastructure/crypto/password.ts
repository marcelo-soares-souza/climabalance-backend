import { env } from '../../shared/utils/env';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

function withPepper(password: string): string {
  return `${password}${env.passwordPepper}`;
}

export const bunPasswordHasher: PasswordHasher = {
  async hash(password: string): Promise<string> {
    return Bun.password.hash(withPepper(password), {
      algorithm: 'bcrypt',
      cost: 12
    });
  },
  async verify(password: string, passwordHash: string): Promise<boolean> {
    return Bun.password.verify(withPepper(password), passwordHash);
  }
};
