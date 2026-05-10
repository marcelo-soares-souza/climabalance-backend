import { describe, expect, it } from 'bun:test';
import type { AuditLogRepository } from '../src/domain/audit/audit-log-repository';
import { Router, type HttpContext } from '../src/shared/http/router';
import { withAuditLogContext } from '../src/shared/http/audit-log-with-context';

describe('audit request context propagation', () => {
  it('injects HttpContext into audit log entries', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const auditLog: Pick<AuditLogRepository, 'log'> = {
      async log(entry) {
        calls.push(entry as Record<string, unknown>);
      },
    };

    const ctx: HttpContext = {
      request: new Request('http://localhost/api/v1/test'),
      params: {},
      query: new URLSearchParams(),
      requestId: 'req-test-1',
      clientIp: '203.0.113.10',
      auth: { userId: 'user-1', roles: ['administrator'] },
    };

    const contextualAuditLog = withAuditLogContext(auditLog, ctx);
    await contextualAuditLog.log({
      actorUserId: 'user-1',
      action: 'test.action',
      entityType: 'test',
      entityId: 'entity-1',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].ctx).toBe(ctx);
  });

  it('uses fallback clientIp from handle options when headers are absent', async () => {
    const router = new Router();
    let capturedClientIp: string | undefined;

    router.add('GET', '/ping', async (ctx) => {
      capturedClientIp = ctx.clientIp;
      return new Response('ok', { status: 200 });
    });

    await router.handle(new Request('http://localhost/ping'), {
      clientIp: '198.51.100.7',
    });

    expect(capturedClientIp).toBe('198.51.100.7');
  });

  it('ignores forwarded IP headers from untrusted proxies', async () => {
    const previousAppEnv = process.env.APP_ENV;
    const previousTrustedProxyIps = process.env.TRUSTED_PROXY_IPS;
    process.env.APP_ENV = 'production';
    process.env.TRUSTED_PROXY_IPS = '192.0.2.10';

    try {
      const router = new Router();
      let capturedClientIp: string | undefined;

      router.add('GET', '/ping', async (ctx) => {
        capturedClientIp = ctx.clientIp;
        return new Response('ok', { status: 200 });
      });

      await router.handle(
        new Request('http://localhost/ping', {
          headers: { 'x-forwarded-for': '203.0.113.99' },
        }),
        { clientIp: '198.51.100.7' },
      );

      expect(capturedClientIp).toBe('198.51.100.7');
    } finally {
      process.env.APP_ENV = previousAppEnv;
      process.env.TRUSTED_PROXY_IPS = previousTrustedProxyIps;
    }
  });

  it('uses forwarded IP headers from trusted proxies', async () => {
    const previousAppEnv = process.env.APP_ENV;
    const previousTrustedProxyIps = process.env.TRUSTED_PROXY_IPS;
    process.env.APP_ENV = 'production';
    process.env.TRUSTED_PROXY_IPS = '198.51.100.7';

    try {
      const router = new Router();
      let capturedClientIp: string | undefined;

      router.add('GET', '/ping', async (ctx) => {
        capturedClientIp = ctx.clientIp;
        return new Response('ok', { status: 200 });
      });

      await router.handle(
        new Request('http://localhost/ping', {
          headers: { 'x-forwarded-for': '203.0.113.99, 198.51.100.7' },
        }),
        { clientIp: '198.51.100.7' },
      );

      expect(capturedClientIp).toBe('203.0.113.99');
    } finally {
      process.env.APP_ENV = previousAppEnv;
      process.env.TRUSTED_PROXY_IPS = previousTrustedProxyIps;
    }
  });
});
