type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFormat = 'text' | 'json';

export type LogContext = {
  requestId?: string;
  userId?: string;
  clientIp?: string;
};

type LogMeta = Record<string, unknown>;
const serviceName = 'backend';

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const sensitiveKeys = new Set([
  'password',
  'password_hash',
  'passwordHash',
  'token',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'authorization',
  'secret',
  'pepper',
  'jwt',
  'api_key',
  'apiKey',
  'card_number',
  'cardnumber',
  'cardholder_name',
  'cvv',
  'cvc',
  'pan',
  'file_base64',
  'base64',
  'cookie',
  'set-cookie'
]);

function getLogLevel(): LogLevel {
  const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
    return level;
  }
  return 'info';
}

function getLogFormat(): LogFormat {
  const format = (process.env.LOG_FORMAT ?? 'text').toLowerCase();
  return format === 'json' ? 'json' : 'text';
}

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[getLogLevel()];
}

function getEnvironment(): string {
  return process.env.APP_ENV ?? 'local';
}

function getBuildVersion(): string {
  return process.env.BUILD_VERSION ?? 'development';
}

function maskValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length === 0) return value;
    return '***';
  }
  if (typeof value === 'number' || typeof value === 'boolean') return '***';
  return '***';
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const env = getEnvironment();
    if (env === 'production' || env === 'staging') {
      return value.replace(/token=([A-Za-z0-9_-]+)/g, 'token=***');
    }
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    const isPassword = normalized.includes('password') || normalized.includes('pepper') || normalized.includes('secret');
    const isToken = normalized.includes('token');
    const isPayment = normalized.includes('card') || normalized.includes('cvv') || normalized.includes('cvc') || normalized.includes('pan');
    const isBinaryPayload = normalized.includes('base64');
    const isCookie = normalized.includes('cookie');

    if (isPassword || isPayment || isBinaryPayload || isCookie) {
      sanitized[key] = maskValue(entry);
      continue;
    }

    if (sensitiveKeys.has(normalized) || isToken) {
      sanitized[key] = maskValue(entry);
      continue;
    }

    sanitized[key] = sanitizeValue(entry, depth + 1);
  }
  return sanitized;
}

function formatText(params: {
  timestamp: string;
  level: LogLevel;
  event: string;
  requestId?: string;
  userId?: string;
  clientIp?: string;
  meta?: LogMeta;
}): string {
  const requestId = params.requestId ?? '-';
  const userId = params.userId ?? '-';
  const clientIp = params.clientIp ?? '-';
  const meta = params.meta ? sanitizeValue(params.meta) : undefined;
  const metaText = meta ? ` ${JSON.stringify(meta)}` : '';
  return `${params.timestamp} ${params.level.toUpperCase()} ${params.event} service=${serviceName} env=${getEnvironment()} build=${getBuildVersion()} request_id=${requestId} user_id=${userId} client_ip=${clientIp}${metaText}`;
}

function formatJson(params: {
  timestamp: string;
  level: LogLevel;
  event: string;
  requestId?: string;
  userId?: string;
  clientIp?: string;
  meta?: LogMeta;
}): string {
  return JSON.stringify({
    timestamp: params.timestamp,
    level: params.level,
    event: params.event,
    msg: params.event,
    service: serviceName,
    environment: getEnvironment(),
    build_version: getBuildVersion(),
    request_id: params.requestId ?? null,
    user_id: params.userId ?? null,
    client_ip: params.clientIp ?? null,
    meta: params.meta ? sanitizeValue(params.meta) : undefined
  });
}

function write(level: LogLevel, message: string): void {
  if (level === 'warn') {
    console.warn(message);
  } else if (level === 'error') {
    console.error(message);
  } else {
    console.log(message);
  }
}

export function log(level: LogLevel, msg: string, meta?: LogMeta, context?: LogContext): void {
  if (!shouldLog(level)) return;
  const timestamp = new Date().toISOString();
  const format = getLogFormat();
  const output = format === 'json'
    ? formatJson({ timestamp, level, event: msg, requestId: context?.requestId, userId: context?.userId, clientIp: context?.clientIp, meta })
    : formatText({ timestamp, level, event: msg, requestId: context?.requestId, userId: context?.userId, clientIp: context?.clientIp, meta });
  write(level, output);
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const meta: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };

    if ('code' in error) {
      meta.code = (error as { code?: unknown }).code;
    }
    if ('detail' in error) {
      meta.detail = (error as { detail?: unknown }).detail;
    }
    if ('constraint' in error) {
      meta.constraint = (error as { constraint?: unknown }).constraint;
    }

    return meta;
  }

  return {
    name: 'UnknownError',
    message: String(error)
  };
}

export function getLogger(context?: LogContext) {
  return {
    debug: (msg: string, meta?: LogMeta) => log('debug', msg, meta, context),
    info: (msg: string, meta?: LogMeta) => log('info', msg, meta, context),
    warn: (msg: string, meta?: LogMeta) => log('warn', msg, meta, context),
    error: (msg: string, meta?: LogMeta) => log('error', msg, meta, context)
  };
}

export const logger = getLogger();

export type ReturnTypeLogger = ReturnType<typeof getLogger>;
