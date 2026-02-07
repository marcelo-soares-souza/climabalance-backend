import { describe, expect, test } from 'bun:test';
import {
  InMemoryRateLimiter,
  withRateLimit,
  type RateLimitPolicies
} from '../src/infrastructure/http/rate-limit';
import type { HttpContext } from '../src/shared/http/router';

function makePolicies(limit: number): RateLimitPolicies {
  return {
    auth: { limit, windowSeconds: 60 },
    public: { limit, windowSeconds: 60 },
    protected: { limit, windowSeconds: 60 },
    admin: { limit, windowSeconds: 60 },
  };
}

function makeCtx(url: string, method: string, clientIp: string): HttpContext {
  const request = new Request(url, { method });
  return {
    request,
    params: {},
    query: new URL(url).searchParams,
    requestId: 'req-1',
    clientIp,
  };
}

describe('rate limit middleware', () => {
  test('returns 429 with limit headers after threshold', async () => {
    let now = 1_000;
    const limiter = new InMemoryRateLimiter(makePolicies(2), () => now);
    const handler = withRateLimit(
      limiter,
      { bucket: 'auth', routeKey: 'POST /api/v1/auth/login' },
      async () => new Response(JSON.stringify({ data: 'ok' }), { status: 200 })
    );
    const ctx = makeCtx('http://localhost/api/v1/auth/login', 'POST', '127.0.0.1');

    const first = await handler(ctx);
    const second = await handler(ctx);
    const third = await handler(ctx);

    expect(first.status).toBe(200);
    expect(first.headers.get('x-ratelimit-limit')).toBe('2');
    expect(first.headers.get('x-ratelimit-remaining')).toBe('1');

    expect(second.status).toBe(200);
    expect(second.headers.get('x-ratelimit-remaining')).toBe('0');

    expect(third.status).toBe(429);
    expect(third.headers.get('x-ratelimit-limit')).toBe('2');
    expect(third.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(third.headers.get('retry-after')).toBe('60');

    const payload = await third.json();
    expect(payload.error.message_key).toBe('request.rate_limited');

    now += 61_000;
    const afterWindow = await handler(ctx);
    expect(afterWindow.status).toBe(200);
    expect(afterWindow.headers.get('x-ratelimit-remaining')).toBe('1');
  });

  test('keeps counters isolated by route key', async () => {
    const limiter = new InMemoryRateLimiter(makePolicies(1), () => 1_000);
    const loginHandler = withRateLimit(
      limiter,
      { bucket: 'auth', routeKey: 'POST /api/v1/auth/login' },
      async () => new Response('ok', { status: 200 })
    );
    const refreshHandler = withRateLimit(
      limiter,
      { bucket: 'auth', routeKey: 'POST /api/v1/auth/refresh' },
      async () => new Response('ok', { status: 200 })
    );

    const loginCtx = makeCtx('http://localhost/api/v1/auth/login', 'POST', '127.0.0.1');
    const refreshCtx = makeCtx('http://localhost/api/v1/auth/refresh', 'POST', '127.0.0.1');

    expect((await loginHandler(loginCtx)).status).toBe(200);
    expect((await loginHandler(loginCtx)).status).toBe(429);
    expect((await refreshHandler(refreshCtx)).status).toBe(200);
  });

  test('keeps counters isolated by client', async () => {
    const limiter = new InMemoryRateLimiter(makePolicies(1), () => 1_000);
    const handler = withRateLimit(
      limiter,
      { bucket: 'protected', routeKey: 'GET /api/v1/users' },
      async () => new Response('ok', { status: 200 })
    );

    const clientA = makeCtx('http://localhost/api/v1/users', 'GET', '10.0.0.1');
    const clientB = makeCtx('http://localhost/api/v1/users', 'GET', '10.0.0.2');

    expect((await handler(clientA)).status).toBe(200);
    expect((await handler(clientA)).status).toBe(429);
    expect((await handler(clientB)).status).toBe(200);
  });
});
