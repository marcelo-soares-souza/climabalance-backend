import { describe, expect, it } from 'bun:test';
import { Router } from '../src/shared/http/router';
import { jsonResponse } from '../src/shared/http/response';

function captureConsole() {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };
  const logs: string[] = [];
  console.log = (message?: unknown) => logs.push(String(message ?? ''));
  console.warn = (message?: unknown) => logs.push(String(message ?? ''));
  console.error = (message?: unknown) => logs.push(String(message ?? ''));

  return {
    logs,
    restore: () => {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    }
  };
}

describe('http logging', () => {
  it('logs request lifecycle with structured metadata', async () => {
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_FORMAT = 'json';
    process.env.APP_ENV = 'test';
    process.env.BUILD_VERSION = 'test-build';

    const router = new Router();
    router.add('GET', '/health', async (ctx) => {
      ctx.auth = { userId: 'user-1', roles: ['administrator'] };
      return jsonResponse(200, { data: { status: 'ok' } }, {
        requestId: ctx.requestId,
        userId: ctx.auth.userId,
        clientIp: ctx.clientIp
      });
    });

    const { logs, restore } = captureConsole();
    await router.handle(new Request('http://localhost/health?verbose=true', {
      headers: {
        'user-agent': 'test-agent',
        'content-type': 'application/json'
      }
    }), { clientIp: '198.51.100.8' });
    restore();

    const events = logs.map((entry) => JSON.parse(entry));
    const started = events.find((entry) => entry.event === 'request.started');
    const completed = events.find((entry) => entry.event === 'request.completed');

    expect(started.meta.route).toBe('/health');
    expect(started.meta.query.keys).toEqual(['verbose']);
    expect(started.meta.user_agent).toBe('test-agent');

    expect(completed.user_id).toBe('user-1');
    expect(completed.meta.status).toBe(200);
    expect(completed.meta.route).toBe('/health');
    expect(typeof completed.meta.duration_ms).toBe('number');
  });
});
