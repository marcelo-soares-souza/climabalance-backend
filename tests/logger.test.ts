import { expect, test } from 'bun:test';

const { getLogger } = await import('../src/shared/utils/logger');

function captureConsole() {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };
  const logs: { level: 'log' | 'warn' | 'error'; message: string }[] = [];
  console.log = (message?: unknown) => logs.push({ level: 'log', message: String(message ?? '') });
  console.warn = (message?: unknown) => logs.push({ level: 'warn', message: String(message ?? '') });
  console.error = (message?: unknown) => logs.push({ level: 'error', message: String(message ?? '') });

  return {
    logs,
    restore: () => {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    }
  };
}

test('logger filters by LOG_LEVEL', () => {
  process.env.LOG_LEVEL = 'info';
  process.env.LOG_FORMAT = 'text';

  const { logs, restore } = captureConsole();
  const logger = getLogger({ requestId: 'req-1', userId: 'user-1', clientIp: '127.0.0.1' });
  logger.debug('debug message');
  logger.info('info message');
  restore();

  expect(logs.length).toBe(1);
  expect(logs[0].message).toContain('INFO');
});

test('logger formats text with required fields and redacts', () => {
  process.env.LOG_LEVEL = 'debug';
  process.env.LOG_FORMAT = 'text';

  const { logs, restore } = captureConsole();
  const logger = getLogger({ requestId: 'req-2', userId: 'user-2', clientIp: '10.0.0.1' });
  logger.info('login.attempt', { email: 'user@example.com', password: 'secret', token: 'abc' });
  restore();

  const output = logs[0].message;
  expect(output).toContain('request_id=req-2');
  expect(output).toContain('user_id=user-2');
  expect(output).toContain('client_ip=10.0.0.1');
  expect(output).toContain('"password":"***"');
  expect(output).toContain('"token":"***"');
});

test('logger formats json with required fields', () => {
  process.env.LOG_LEVEL = 'debug';
  process.env.LOG_FORMAT = 'json';

  const { logs, restore } = captureConsole();
  const logger = getLogger({ requestId: 'req-3', userId: 'user-3', clientIp: '192.168.1.10' });
  logger.warn('auth.failed', { authorization: 'Bearer abc' });
  restore();

  const parsed = JSON.parse(logs[0].message);
  expect(parsed.level).toBe('warn');
  expect(parsed.request_id).toBe('req-3');
  expect(parsed.user_id).toBe('user-3');
  expect(parsed.client_ip).toBe('192.168.1.10');
  expect(parsed.meta.authorization).toBe('***');
});
