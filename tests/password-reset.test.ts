import { expect, test } from 'bun:test';

process.env.APP_ENV = 'test';
process.env.APP_PORT = '3000';
process.env.APP_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-aud';
process.env.JWT_TTL_SECONDS = '900';
process.env.PASSWORD_PEPPER = 'test-pepper';
process.env.EMAIL_FROM = 'no-reply@example.com';
process.env.EMAIL_CONFIRM_TTL_MINUTES = '60';
process.env.PASSWORD_RESET_TTL_MINUTES = '60';

const { requestPasswordReset } = await import('../src/application/auth/request-password-reset');
const { resetPassword } = await import('../src/application/auth/reset-password');

import type { User } from '../src/domain/user/user';
import type { UserProfile } from '../src/domain/user/user';
import type { UserFilters, UserRepository } from '../src/domain/user/user-repository';
import type { PasswordResetToken, PasswordResetRepository } from '../src/domain/user/password-reset-repository';
import type { EmailSender, EmailMessage } from '../src/infrastructure/email/email-sender';
import type { PasswordHasher } from '../src/infrastructure/crypto/password';

class MemoryUserRepository implements UserRepository {
  users: User[] = [];
  roles = new Map<string, string[]>();
  profiles = new Map<string, UserProfile>();

  async create(input: { id: string; email: string; passwordHash: string; status: User['status']; locale: string; emailConfirmedAt?: Date | null; }): Promise<User> {
    const now = new Date();
    const user: User = {
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      status: input.status,
      locale: input.locale,
      emailConfirmedAt: input.emailConfirmedAt ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    this.users.push(user);
    return user;
  }

  async update(input: { id: string; email?: string; passwordHash?: string; status?: User['status']; locale?: string; emailConfirmedAt?: Date | null; deletedAt?: Date | null; }): Promise<User | null> {
    const user = this.users.find((u) => u.id === input.id) ?? null;
    if (!user) return null;
    if (input.email !== undefined) user.email = input.email;
    if (input.passwordHash !== undefined) user.passwordHash = input.passwordHash;
    if (input.status !== undefined) user.status = input.status;
    if (input.locale !== undefined) user.locale = input.locale;
    if (input.emailConfirmedAt !== undefined) user.emailConfirmedAt = input.emailConfirmedAt;
    if (input.deletedAt !== undefined) user.deletedAt = input.deletedAt;
    user.updatedAt = new Date();
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async list(_filters: UserFilters): Promise<User[]> {
    return this.users;
  }

  async softDelete(id: string): Promise<User | null> {
    const user = this.users.find((u) => u.id === id) ?? null;
    if (!user) return null;
    user.deletedAt = new Date();
    user.updatedAt = new Date();
    return user;
  }

  async upsertProfile(userId: string, profile: Partial<UserProfile>): Promise<UserProfile> {
    const existing = this.profiles.get(userId);
    const now = new Date();
    if (!existing) {
      const created: UserProfile = {
        id: profile.id ?? `profile-${userId}`,
        userId,
        displayName: profile.displayName,
        documentType: profile.documentType,
        documentNumber: profile.documentNumber,
        birthDate: profile.birthDate,
        phone: profile.phone,
        countryCode: profile.countryCode,
        addressLine1: profile.addressLine1,
        addressLine2: profile.addressLine2,
        addressCity: profile.addressCity,
        addressState: profile.addressState,
        addressPostalCode: profile.addressPostalCode,
        addressCountry: profile.addressCountry,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      };
      this.profiles.set(userId, created);
      return created;
    }

    const updated: UserProfile = {
      ...existing,
      ...profile,
      updatedAt: now
    };
    this.profiles.set(userId, updated);
    return updated;
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async getRoles(userId: string): Promise<string[]> {
    return this.roles.get(userId) ?? [];
  }

  async assignRole(userId: string, roleKey: string): Promise<void> {
    const list = this.roles.get(userId) ?? [];
    list.push(roleKey);
    this.roles.set(userId, list);
  }
}

class MemoryPasswordResetRepository implements PasswordResetRepository {
  tokens: PasswordResetToken[] = [];

  async create(input: PasswordResetToken): Promise<PasswordResetToken> {
    this.tokens.push(input);
    return input;
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.tokens.find((token) => token.tokenHash === tokenHash && !token.deletedAt) ?? null;
  }

  async markUsed(id: string, usedAt: Date): Promise<PasswordResetToken | null> {
    const token = this.tokens.find((record) => record.id === id) ?? null;
    if (!token) return null;
    token.usedAt = usedAt;
    token.updatedAt = usedAt;
    return token;
  }
}

class MemoryEmailSender implements EmailSender {
  messages: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

const fakePasswordHasher: PasswordHasher = {
  async hash(password: string): Promise<string> {
    return `hash:${password}`;
  },
  async verify(password: string, passwordHash: string): Promise<boolean> {
    return passwordHash === `hash:${password}`;
  }
};

test('request and reset password flow', async () => {
  const users = new MemoryUserRepository();
  const passwordResets = new MemoryPasswordResetRepository();
  const emailSender = new MemoryEmailSender();

  await users.create({
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash:old',
    status: 'active',
    locale: 'pt-BR',
    emailConfirmedAt: new Date()
  });

  const requestResult = await requestPasswordReset(
    { email: 'user@example.com' },
    { users, passwordResets, emailSender }
  );

  expect(requestResult.delivered).toBe(true);
  expect(emailSender.messages.length).toBe(1);

  const message = emailSender.messages[0];
  const tokenMatch = message.text.match(/token=([A-Za-z0-9_-]+)/);
  expect(tokenMatch).not.toBeNull();
  const token = tokenMatch?.[1] ?? '';

  await resetPassword(
    { token, password: 'new-password' },
    { passwordResets, users, passwordHasher: fakePasswordHasher }
  );

  const user = await users.findByEmail('user@example.com');
  expect(user?.passwordHash).toBe('hash:new-password');

  await expect(
    resetPassword(
      { token, password: 'other-password' },
      { passwordResets, users, passwordHasher: fakePasswordHasher }
    )
  ).rejects.toThrow('token_already_used');
});
