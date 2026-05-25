import { expect, test, describe, beforeEach } from "bun:test";

// Use cases
import { authenticateUser } from "../src/application/auth/authenticate-user";
import { refreshAccessToken } from "../src/application/auth/refresh-access-token";
import { revokeRefreshToken } from "../src/application/auth/revoke-refresh-token";

// Types
import type { User, UserProfile } from "../src/domain/user/user";
import type {
  UserRepository,
  UserFilters,
  PublicDirectoryItem,
} from "../src/domain/user/user-repository";
import type {
  RefreshToken,
  RefreshTokenRepository,
} from "../src/domain/user/refresh-token-repository";

// --- In-memory repositories ---

class MemoryUserRepository implements UserRepository {
  users: User[] = [];
  roles = new Map<string, string[]>();
  profiles = new Map<string, UserProfile>();

  async create(input: any): Promise<User> {
    const now = new Date();
    const user: User = {
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      slug: input.slug,
      status: input.status,
      locale: input.locale,
      emailConfirmedAt: input.emailConfirmedAt ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.users.push(user);
    return user;
  }
  async update(_input: any): Promise<User | null> {
    return null;
  }
  async findById(id: string): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async findBySlug(slug: string): Promise<User | null> {
    return this.users.find((u) => u.slug === slug) ?? null;
  }
  async listPublicDirectory(
    _limit: number,
    _offset: number,
  ): Promise<PublicDirectoryItem[]> {
    return [];
  }
  async list(_f: UserFilters): Promise<User[]> {
    return this.users;
  }
  async softDelete(_id: string): Promise<User | null> {
    return null;
  }
  async cascadeSoftDelete(_userId: string): Promise<void> {}
  async upsertProfile(
    _userId: string,
    _profile: Partial<UserProfile>,
  ): Promise<UserProfile> {
    return {} as any;
  }
  async getProfile(_userId: string): Promise<UserProfile | null> {
    return null;
  }
  async getRoles(userId: string): Promise<string[]> {
    return this.roles.get(userId) ?? [];
  }
  async updateLastLogin(_userId: string, _lastLoginAt: Date): Promise<void> {}
  async assignRole(userId: string, roleKey: string): Promise<void> {
    const list = this.roles.get(userId) ?? [];
    list.push(roleKey);
    this.roles.set(userId, list);
  }
}

class MemoryRefreshTokenRepository implements RefreshTokenRepository {
  tokens: RefreshToken[] = [];
  async create(input: RefreshToken): Promise<RefreshToken> {
    this.tokens.push(input);
    return input;
  }
  async findByTokenHash(hash: string): Promise<RefreshToken | null> {
    return (
      this.tokens.find((t) => t.tokenHash === hash && !t.deletedAt) ?? null
    );
  }
  async revoke(id: string, revokedAt: Date): Promise<void> {
    const t = this.tokens.find((t) => t.id === id);
    if (t) t.revokedAt = revokedAt;
  }
  async revokeAllByUserId(userId: string, revokedAt: Date): Promise<void> {
    this.tokens
      .filter((t) => t.userId === userId && !t.revokedAt)
      .forEach((t) => (t.revokedAt = revokedAt));
  }
}

// --- Mock services ---

const fakePasswordHasher = {
  async hash(password: string) {
    return `hash:${password}`;
  },
  async verify(password: string, passwordHash: string) {
    return passwordHash === `hash:${password}`;
  },
};

const mockJwtService = {
  async sign(payload: object, _secret: string): Promise<string> {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    return `${header}.${payloadStr}.mock-sig`;
  },
  async verify(_token: string, _secret: string): Promise<object> {
    return { sub: "test-user", roles: ["individual"] };
  },
};

const mockHashService = {
  async sha256(input: string): Promise<string> {
    return Buffer.from(input).toString("hex");
  },
};

let tokenCounter = 0;
const mockTokenGenerator = {
  generate: () => `refresh-token-${++tokenCounter}`,
};

let idCounter = 100;
const mockIdGenerator = {
  generate: () => `id-${++idCounter}`,
};

let mockTime = new Date("2024-06-01T12:00:00Z");
const mockClock = {
  now: () => mockTime,
};

const mockConfig = {
  jwtSecret: "test-secret",
  jwtIssuer: "test-issuer",
  jwtAudience: "test-audience",
  jwtTtlSeconds: 900,
  emailConfirmTtlMinutes: 60,
  passwordResetTtlMinutes: 60,
  refreshTokenTtlDays: 7,
  frontendUrl: "http://localhost:3000",
};

// --- Shared state ---

let users: MemoryUserRepository;
let refreshTokens: MemoryRefreshTokenRepository;

function resetState() {
  users = new MemoryUserRepository();
  refreshTokens = new MemoryRefreshTokenRepository();
  tokenCounter = 0;
  idCounter = 100;
  mockTime = new Date("2024-06-01T12:00:00Z");
}

async function seedUser() {
  await users.create({
    id: "user-1",
    email: "user@test.com",
    passwordHash: "hash:password123",
    status: "active",
    locale: "pt-BR",
    emailConfirmedAt: new Date("2024-01-01"),
  });
  await users.assignRole("user-1", "individual");
}

const authDeps = () => ({
  users,
  refreshTokens,
  passwordHasher: fakePasswordHasher,
  jwtService: mockJwtService,
  hashService: mockHashService,
  tokenGenerator: mockTokenGenerator,
  idGenerator: mockIdGenerator,
  clock: mockClock,
  config: mockConfig,
});

const refreshDeps = () => ({
  refreshTokens,
  users,
  jwtService: mockJwtService,
  hashService: mockHashService,
  tokenGenerator: mockTokenGenerator,
  idGenerator: mockIdGenerator,
  clock: mockClock,
  config: mockConfig,
});

const revokeDeps = () => ({
  refreshTokens,
  hashService: mockHashService,
  clock: mockClock,
});

describe("Refresh Token - Full Cycle", () => {
  beforeEach(() => {
    resetState();
  });

  test("login issues refresh token alongside access token", async () => {
    await seedUser();

    const result = await authenticateUser(
      { email: "user@test.com", password: "password123" },
      authDeps(),
    );

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.tokenType).toBe("Bearer");
    expect(result.expiresIn).toBe(900);
    expect(result.refreshExpiresIn).toBe(7 * 86400);
    expect(refreshTokens.tokens.length).toBe(1);
    expect(refreshTokens.tokens[0].userId).toBe("user-1");
  });

  test("refresh token can be used to get new access token", async () => {
    await seedUser();

    const loginResult = await authenticateUser(
      { email: "user@test.com", password: "password123" },
      authDeps(),
    );

    const refreshResult = await refreshAccessToken(
      { refreshToken: loginResult.refreshToken },
      refreshDeps(),
    );

    expect(refreshResult.accessToken).toBeDefined();
    expect(refreshResult.refreshToken).toBeDefined();
    expect(refreshResult.tokenType).toBe("Bearer");
    expect(refreshResult.expiresIn).toBe(900);
    expect(refreshResult.refreshExpiresIn).toBe(7 * 86400);
    // Old token revoked, new one created
    expect(refreshTokens.tokens.length).toBe(2);
    expect(refreshTokens.tokens[0].revokedAt).toBeDefined();
    expect(refreshTokens.tokens[1].revokedAt).toBeUndefined();
  });

  test("refresh rotates token (old token cannot be reused)", async () => {
    await seedUser();

    const loginResult = await authenticateUser(
      { email: "user@test.com", password: "password123" },
      authDeps(),
    );

    // Use refresh token once
    await refreshAccessToken(
      { refreshToken: loginResult.refreshToken },
      refreshDeps(),
    );

    // Try to reuse the same refresh token
    try {
      await refreshAccessToken(
        { refreshToken: loginResult.refreshToken },
        refreshDeps(),
      );
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.code).toBe("INVALID_TOKEN");
    }
  });

  test("revoke makes refresh token unusable", async () => {
    await seedUser();

    const loginResult = await authenticateUser(
      { email: "user@test.com", password: "password123" },
      authDeps(),
    );

    await revokeRefreshToken(
      { refreshToken: loginResult.refreshToken },
      revokeDeps(),
    );

    // Token should be revoked
    expect(refreshTokens.tokens[0].revokedAt).toBeDefined();

    // Try to use revoked token
    try {
      await refreshAccessToken(
        { refreshToken: loginResult.refreshToken },
        refreshDeps(),
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe("INVALID_TOKEN");
    }
  });

  test("revoking already-revoked token is idempotent", async () => {
    await seedUser();

    const loginResult = await authenticateUser(
      { email: "user@test.com", password: "password123" },
      authDeps(),
    );

    await revokeRefreshToken(
      { refreshToken: loginResult.refreshToken },
      revokeDeps(),
    );

    // Revoking again should not throw
    await revokeRefreshToken(
      { refreshToken: loginResult.refreshToken },
      revokeDeps(),
    );

    expect(refreshTokens.tokens[0].revokedAt).toBeDefined();
  });

  test("expired refresh token is rejected", async () => {
    await seedUser();

    const loginResult = await authenticateUser(
      { email: "user@test.com", password: "password123" },
      authDeps(),
    );

    // Advance time past expiry (7 days + 1 second)
    mockTime = new Date("2024-06-08T12:00:01Z");

    try {
      await refreshAccessToken(
        { refreshToken: loginResult.refreshToken },
        refreshDeps(),
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe("TOKEN_EXPIRED");
    }
  });

  test("invalid refresh token is rejected", async () => {
    try {
      await refreshAccessToken(
        { refreshToken: "totally-invalid-token" },
        refreshDeps(),
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe("INVALID_TOKEN");
    }
  });

  test("revoking invalid token throws error", async () => {
    try {
      await revokeRefreshToken(
        { refreshToken: "nonexistent-token" },
        revokeDeps(),
      );
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe("INVALID_TOKEN");
    }
  });

  test("multiple logins create independent refresh tokens", async () => {
    await seedUser();

    const login1 = await authenticateUser(
      { email: "user@test.com", password: "password123" },
      authDeps(),
    );

    const login2 = await authenticateUser(
      { email: "user@test.com", password: "password123" },
      authDeps(),
    );

    expect(refreshTokens.tokens.length).toBe(2);
    expect(login1.refreshToken).not.toBe(login2.refreshToken);

    // Both should be valid
    const refresh1 = await refreshAccessToken(
      { refreshToken: login1.refreshToken },
      refreshDeps(),
    );
    const refresh2 = await refreshAccessToken(
      { refreshToken: login2.refreshToken },
      refreshDeps(),
    );

    expect(refresh1.accessToken).toBeDefined();
    expect(refresh2.accessToken).toBeDefined();
  });

  test("chained refresh works (refresh → refresh → refresh)", async () => {
    await seedUser();

    const login = await authenticateUser(
      { email: "user@test.com", password: "password123" },
      authDeps(),
    );

    const refresh1 = await refreshAccessToken(
      { refreshToken: login.refreshToken },
      refreshDeps(),
    );

    const refresh2 = await refreshAccessToken(
      { refreshToken: refresh1.refreshToken },
      refreshDeps(),
    );

    const refresh3 = await refreshAccessToken(
      { refreshToken: refresh2.refreshToken },
      refreshDeps(),
    );

    expect(refresh3.accessToken).toBeDefined();
    expect(refresh3.refreshToken).toBeDefined();
    // login token + 3 refresh tokens = 4 total
    expect(refreshTokens.tokens.length).toBe(4);
    // Only the last one should not be revoked
    expect(refreshTokens.tokens[3].revokedAt).toBeUndefined();
    expect(refreshTokens.tokens.filter((t) => t.revokedAt).length).toBe(3);
  });
});
