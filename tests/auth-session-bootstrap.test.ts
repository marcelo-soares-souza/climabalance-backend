process.env.APP_ENV = 'test';
process.env.APP_PORT = '3000';
process.env.APP_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret';
process.env.CSRF_SECRET = 'test-csrf-secret';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.JWT_TTL_SECONDS = '900';
process.env.PASSWORD_PEPPER = 'test-pepper';
process.env.EMAIL_FROM = 'no-reply@example.com';
process.env.EMAIL_CONFIRM_TTL_MINUTES = '60';

import { describe, expect, test } from 'bun:test';
import { createAuthHandlers } from '../src/infrastructure/http/auth-handlers';
import { buildCsrfToken } from '../src/shared/http/csrf';
import { env } from '../src/shared/utils/env';

const now = new Date('2026-05-18T12:00:00.000Z');

const baseDeps = {
  users: {},
  consents: {},
  confirmations: {},
  passwordResets: {},
  refreshTokens: {
    async findByTokenHash() {
      return null;
    },
  },
  auditLog: { async log() {} },
  passwordHasher: {},
  emailSender: {},
  unitOfWork: {},
  tokenGenerator: {},
  jwtService: {},
  hashService: {
    async sha256(value: string) {
      return `hash:${value}`;
    },
  },
  idGenerator: {},
  clock: {
    now: () => now,
  },
  config: {},
  jobQueue: {},
} as any;

function makeContext(cookie?: string) {
  return {
    request: new Request('http://localhost/api/v1/auth/session', {
      method: 'GET',
      headers: cookie ? { cookie } : undefined,
    }),
    params: {},
    query: new URL('http://localhost/api/v1/auth/session').searchParams,
    locale: 'pt-BR',
  } as any;
}

describe('GET /api/v1/auth/session', () => {
  test('returns 204 when there is no refresh cookie', async () => {
    const handlers = createAuthHandlers(baseDeps);

    const response = await handlers.sessionBootstrap(makeContext());

    expect(response.status).toBe(204);
  });

  test('returns csrf token when there is a valid active refresh session', async () => {
    const refreshToken = 'refresh-token-1';
    const handlers = createAuthHandlers({
      ...baseDeps,
      refreshTokens: {
        async findByTokenHash(hash: string) {
          expect(hash).toBe(`hash:${refreshToken}`);
          return {
            id: 'session-1',
            userId: 'user-1',
            tokenHash: hash,
            expiresAt: new Date('2026-05-19T12:00:00.000Z'),
            revokedAt: null,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          };
        },
      },
    });

    const response = await handlers.sessionBootstrap(
      makeContext(`${env.refreshCookieName}=${refreshToken}`),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.csrfToken).toBe(await buildCsrfToken(refreshToken));
  });

  test('clears stale refresh cookie when the stored session is no longer valid', async () => {
    const handlers = createAuthHandlers({
      ...baseDeps,
      refreshTokens: {
        async findByTokenHash(hash: string) {
          return {
            id: 'session-1',
            userId: 'user-1',
            tokenHash: hash,
            expiresAt: new Date('2026-05-17T12:00:00.000Z'),
            revokedAt: null,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          };
        },
      },
    });

    const response = await handlers.sessionBootstrap(
      makeContext(`${env.refreshCookieName}=refresh-token-1`),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain(`${env.refreshCookieName}=`);
  });
});
