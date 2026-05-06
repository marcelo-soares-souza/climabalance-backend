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

const { registerUser } = await import('../src/application/auth/register-user');
const { authenticateUser } = await import('../src/application/auth/authenticate-user');
const { confirmEmail } = await import('../src/application/auth/confirm-email');

import type { User } from '../src/domain/user/user';
import type { UserProfile } from '../src/domain/user/user';
import type { UserRepository, UserFilters } from '../src/domain/user/user-repository';
import type { EmailConfirmation, EmailConfirmationRepository } from '../src/domain/user/email-confirmation-repository';
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
        about: profile.about,
        websiteUrl: profile.websiteUrl,
        instagramUrl: profile.instagramUrl,
        facebookUrl: profile.facebookUrl,
        xUrl: profile.xUrl,
        blueskyUrl: profile.blueskyUrl,
        mastodonUrl: profile.mastodonUrl,
        youtubeUrl: profile.youtubeUrl,
        linkedinUrl: profile.linkedinUrl,
        avatarPath: profile.avatarPath,
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

  async cascadeSoftDelete(_userId: string): Promise<void> {
  }

  async assignRole(userId: string, roleKey: string): Promise<void> {
    const list = this.roles.get(userId) ?? [];
    list.push(roleKey);
    this.roles.set(userId, list);
  }

  async updateLastLogin(id: string, lastLoginAt: Date): Promise<void> {
    const user = this.users.find((entry) => entry.id === id);
    if (!user) return;
    user.lastLoginAt = lastLoginAt;
    user.updatedAt = lastLoginAt;
  }
}

class MemoryEmailConfirmationRepository implements EmailConfirmationRepository {
  confirmations: EmailConfirmation[] = [];

  async create(input: EmailConfirmation): Promise<EmailConfirmation> {
    this.confirmations.push(input);
    return input;
  }

  async findByTokenHash(tokenHash: string): Promise<EmailConfirmation | null> {
    return this.confirmations.find((c) => c.tokenHash === tokenHash && !c.deletedAt) ?? null;
  }

  async markConfirmed(id: string, confirmedAt: Date): Promise<EmailConfirmation | null> {
    const record = this.confirmations.find((c) => c.id === id) ?? null;
    if (!record) return null;
    record.confirmedAt = confirmedAt;
    record.updatedAt = confirmedAt;
    return record;
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

// Mock services
const mockTokenGenerator = {
  generate: () => 'mock-token-abc123'
};

const mockJwtService = {
  async sign(payload: object, _secret: string): Promise<string> {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = 'mock-signature';
    return `${header}.${payloadStr}.${signature}`;
  },
  async verify(_token: string, _secret: string): Promise<object> {
    return { sub: 'test-user', roles: ['individual'] };
  }
};

const mockHashService = {
  async sha256(input: string): Promise<string> {
    return Buffer.from(input).toString('hex');
  }
};

let idCounter = 0;
const mockIdGenerator = {
  generate: () => `test-id-${++idCounter}`
};

const mockTime = new Date('2024-01-01T00:00:00Z');
const mockClock = {
  now: () => mockTime
};

const mockConfig = {
  jwtSecret: 'test-secret',
  jwtIssuer: 'test-issuer',
  jwtAudience: 'test-audience',
  jwtTtlSeconds: 900,
  emailConfirmTtlMinutes: 60,
  passwordResetTtlMinutes: 60,
  refreshTokenTtlDays: 7,
  frontendUrl: 'http://localhost:3000'
};

class MemoryRefreshTokenRepository {
  tokens: any[] = [];
  async create(input: any) { this.tokens.push(input); return input; }
  async findByTokenHash(hash: string) { return this.tokens.find((t) => t.tokenHash === hash && !t.deletedAt) ?? null; }
  async revoke(id: string, revokedAt: Date) { const t = this.tokens.find((t) => t.id === id); if (t) t.revokedAt = revokedAt; }
  async revokeAllByUserId(userId: string, revokedAt: Date) { this.tokens.filter((t) => t.userId === userId && !t.revokedAt).forEach((t) => t.revokedAt = revokedAt); }
}

// Factory function to create a mock UnitOfWork for tests
function createMockUnitOfWork(repos: { users: any; confirmations: any }) {
  return {
    async execute<T>(work: (tx: any) => Promise<T>): Promise<T> {
      const mockTransaction = {
        getUserRepository: () => repos.users,
        getEmailConfirmationRepository: () => repos.confirmations,
        getPasswordResetRepository: () => ({}),
        getAuditLogRepository: () => ({}),
        getFootprintCalculationRepository: () => ({}),
        getFootprintInputRepository: () => ({}),
        getFootprintBreakdownRepository: () => ({}),
        getCompensationProjectionRepository: () => ({})
      };
      return work(mockTransaction);
    }
  };
}

test('register, confirm email, and authenticate user', async () => {
  const users = new MemoryUserRepository();
  const confirmations = new MemoryEmailConfirmationRepository();
  const emailSender = new MemoryEmailSender();
  const unitOfWork = createMockUnitOfWork({ users, confirmations });

  const result = await registerUser(
    {
      email: 'user@example.com',
      password: 'secret123',
      locale: 'pt-BR',
      roleKey: 'individual'
    },
    {
      users,
      confirmations,
      passwordHasher: fakePasswordHasher,
      emailSender,
      unitOfWork,
      tokenGenerator: mockTokenGenerator,
      hashService: mockHashService,
      idGenerator: mockIdGenerator,
      clock: mockClock,
      config: mockConfig
    }
  );

  expect(result.email).toBe('user@example.com');
  expect(result.status).toBe('pending');
  expect(emailSender.messages.length).toBe(1);

  const message = emailSender.messages[0];
  const tokenMatch = message.text.match(/token=([A-Za-z0-9_-]+)/);
  expect(tokenMatch).not.toBeNull();
  const token = tokenMatch?.[1] ?? '';

  await confirmEmail(token, {
    confirmations,
    users,
    hashService: mockHashService,
    clock: mockClock
  });

  const user = await users.findByEmail('user@example.com');
  expect(user?.emailConfirmedAt).not.toBeNull();
  expect(user?.status).toBe('active');

  const refreshTokens = new MemoryRefreshTokenRepository();
  const authResult = await authenticateUser(
    { email: 'user@example.com', password: 'secret123' },
    {
      users,
      refreshTokens,
      passwordHasher: fakePasswordHasher,
      jwtService: mockJwtService,
      hashService: mockHashService,
      tokenGenerator: mockTokenGenerator,
      idGenerator: mockIdGenerator,
      clock: mockClock,
      config: mockConfig
    }
  );

  expect(authResult.tokenType).toBe('Bearer');
  expect(authResult.accessToken.split('.').length).toBe(3);
  expect(authResult.expiresIn).toBe(900);
  expect(authResult.refreshToken).toBeDefined();
  expect(authResult.refreshExpiresIn).toBe(7 * 86400);
  expect(refreshTokens.tokens.length).toBe(1);
});
