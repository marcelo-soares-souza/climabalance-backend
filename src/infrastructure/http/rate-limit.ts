import type { Handler, HttpContext } from '../../shared/http/router';
import { buildLogContext } from '../../shared/http/log-context';
import { errorResponse } from '../../shared/http/response';
import { valkey } from '../cache/valkey-client';

export type RateLimitBucket = 'auth' | 'public' | 'protected' | 'admin' | 'media';

export type RateLimitPolicy = {
  limit: number;
  windowSeconds: number;
};

export type RateLimitPolicies = Record<RateLimitBucket, RateLimitPolicy>;

export const defaultRateLimitPolicies: RateLimitPolicies = {
  auth: { limit: 20, windowSeconds: 60 },
  public: { limit: 120, windowSeconds: 60 },
  protected: { limit: 180, windowSeconds: 60 },
  admin: { limit: 60, windowSeconds: 60 },
  media: { limit: 600, windowSeconds: 60 },
};

type RateLimitInput = {
  bucket: RateLimitBucket;
  routeKey: string;
  clientId: string;
};

type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
};

export class InMemoryRateLimiter {
  private readonly records = new Map<string, { count: number; resetAtMs: number }>();

  constructor(
    private readonly policies: RateLimitPolicies = defaultRateLimitPolicies,
    private readonly nowMs: () => number = () => Date.now()
  ) {}

  consume(input: RateLimitInput): RateLimitDecision {
    this.pruneExpired();
    const policy = this.policies[input.bucket];
    const now = this.nowMs();
    const key = `${input.bucket}|${input.routeKey}|${input.clientId}`;
    const existing = this.records.get(key);

    if (!existing || existing.resetAtMs <= now) {
      const resetAtMs = now + policy.windowSeconds * 1000;
      this.records.set(key, { count: 1, resetAtMs });
      return { allowed: true, limit: policy.limit, remaining: Math.max(policy.limit - 1, 0), resetAtMs, retryAfterSeconds: 0 };
    }

    if (existing.count >= policy.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000));
      return { allowed: false, limit: policy.limit, remaining: 0, resetAtMs: existing.resetAtMs, retryAfterSeconds };
    }

    existing.count += 1;
    this.records.set(key, existing);
    return { allowed: true, limit: policy.limit, remaining: Math.max(policy.limit - existing.count, 0), resetAtMs: existing.resetAtMs, retryAfterSeconds: 0 };
  }

  private pruneExpired() {
    const now = this.nowMs();
    for (const [key, record] of this.records.entries()) {
      if (record.resetAtMs <= now) this.records.delete(key);
    }
  }
}

export async function consumeValkeyRateLimit(
  input: RateLimitInput,
  policies?: RateLimitPolicies,
  fallbackLimiter: InMemoryRateLimiter = new InMemoryRateLimiter(policies)
): Promise<RateLimitDecision> {
  const p = (policies ?? defaultRateLimitPolicies)[input.bucket];
  const key = `rl:${input.bucket}:${input.clientId}:${input.routeKey}`;
  try {
    const result = await valkey.multi()
      .incr(key)
      .pttl(key)
      .exec();

    if (!result) throw new Error('valkey no result');

    const count = result[0][1] as number;
    let ttl = result[1][1] as number;

    if (count === 1) {
      await valkey.pexpire(key, p.windowSeconds * 1000);
      ttl = p.windowSeconds * 1000;
    }

    const resetAtMs = Date.now() + (ttl > 0 ? ttl : p.windowSeconds * 1000);
    const remaining = Math.max(p.limit - count, 0);

    if (count > p.limit) {
      return { allowed: false, limit: p.limit, remaining: 0, resetAtMs, retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1000)) };
    }

    return { allowed: true, limit: p.limit, remaining, resetAtMs, retryAfterSeconds: 0 };
  } catch {
    // Fallback to process-local memory when Valkey is temporarily unavailable.
    return fallbackLimiter.consume(input);
  }
}

export async function checkLoginLockout(identifier: string): Promise<{ blocked: boolean; remainingAttempts: number; retryAfterSeconds: number }> {
  const key = `login:lockout:${identifier}`;
  try {
    const ttl = await valkey.ttl(key);
    if (ttl > 0) {
      return { blocked: true, remainingAttempts: 0, retryAfterSeconds: ttl };
    }
    const attempts = await valkey.get(`login:attempts:${identifier}`);
    const count = attempts ? Number(attempts) : 0;
    return { blocked: false, remainingAttempts: Math.max(5 - count, 0), retryAfterSeconds: 0 };
  } catch {
    return { blocked: false, remainingAttempts: 5, retryAfterSeconds: 0 };
  }
}

export async function recordLoginAttempt(identifier: string, success: boolean): Promise<void> {
  const key = `login:attempts:${identifier}`;
  try {
    if (success) {
      await valkey.del(key);
      await valkey.del(`login:lockout:${identifier}`);
    } else {
      const count = await valkey.incr(key);
      await valkey.expire(key, 900); // 15min window
      if (count >= 5) {
        await valkey.set(`login:lockout:${identifier}`, '1', 'EX', 300); // 5min lockout
      }
    }
  } catch { /* valkey unavailable */ }
}

export function withRateLimit(
  limiter: InMemoryRateLimiter,
  options: { bucket: RateLimitBucket; routeKey: string; distributed?: boolean },
  handler: Handler
): Handler {
  return async (ctx: HttpContext) => {
    const input = { bucket: options.bucket, routeKey: options.routeKey, clientId: ctx.clientIp ?? 'unknown' };
    const decision = options.distributed === false
      ? limiter.consume(input)
      : await consumeValkeyRateLimit(input, undefined, limiter);
    if (!decision.allowed) {
      const response = errorResponse(429, 'request.rate_limited', { retry_after_seconds: decision.retryAfterSeconds }, buildLogContext(ctx));
      return applyRateLimitHeaders(response, decision);
    }
    const response = await handler(ctx);
    return applyRateLimitHeaders(response, decision);
  };
}

function applyRateLimitHeaders(response: Response, decision: RateLimitDecision): Response {
  const headers = new Headers(response.headers);
  headers.set('x-ratelimit-limit', String(decision.limit));
  headers.set('x-ratelimit-remaining', String(decision.remaining));
  headers.set('x-ratelimit-reset', String(Math.ceil(decision.resetAtMs / 1000)));
  if (!decision.allowed) headers.set('retry-after', String(decision.retryAfterSeconds));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
