const levelOrder = {
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
    'apiKey'
]);
function getLogLevel() {
    const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
    if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
        return level;
    }
    return 'info';
}
function getLogFormat() {
    const format = (process.env.LOG_FORMAT ?? 'text').toLowerCase();
    return format === 'json' ? 'json' : 'text';
}
function shouldLog(level) {
    return levelOrder[level] >= levelOrder[getLogLevel()];
}
function maskValue(value) {
    if (value === null || value === undefined)
        return value;
    if (typeof value === 'string') {
        if (value.length === 0)
            return value;
        return '***';
    }
    if (typeof value === 'number' || typeof value === 'boolean')
        return '***';
    return '***';
}
function shouldMaskSensitiveData() {
    const env = (process.env.APP_ENV ?? 'local').toLowerCase();
    return env !== 'local' && env !== 'development' && env !== 'test';
}
function sanitizeValue(value, depth = 0) {
    if (depth > 4)
        return '[REDACTED]';
    if (value === null || value === undefined)
        return value;
    if (typeof value === 'string') {
        if (shouldMaskSensitiveData()) {
            return value.replace(/token=([A-Za-z0-9_-]+)/g, 'token=***');
        }
        return value;
    }
    if (typeof value !== 'object')
        return value;
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeValue(item, depth + 1));
    }
    const sanitized = {};
    for (const [key, entry] of Object.entries(value)) {
        const normalized = key.toLowerCase();
        const isPassword = normalized.includes('password') || normalized.includes('pepper') || normalized.includes('secret');
        const isToken = normalized.includes('token');
        if (isPassword) {
            sanitized[key] = maskValue(entry);
            continue;
        }
        if (shouldMaskSensitiveData() && (sensitiveKeys.has(normalized) || isToken)) {
            sanitized[key] = maskValue(entry);
            continue;
        }
        sanitized[key] = sanitizeValue(entry, depth + 1);
    }
    return sanitized;
}
function formatText(params) {
    const requestId = params.requestId ?? '-';
    const userId = params.userId ?? '-';
    const clientIp = params.clientIp ?? '-';
    const meta = params.meta ? sanitizeValue(params.meta) : undefined;
    const metaText = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${params.timestamp} ${params.level.toUpperCase()} ${params.msg} request_id=${requestId} user_id=${userId} client_ip=${clientIp}${metaText}`;
}
function formatJson(params) {
    return JSON.stringify({
        timestamp: params.timestamp,
        level: params.level,
        msg: params.msg,
        request_id: params.requestId ?? null,
        user_id: params.userId ?? null,
        client_ip: params.clientIp ?? null,
        meta: params.meta ? sanitizeValue(params.meta) : undefined
    });
}
function write(level, message) {
    if (level === 'warn') {
        console.warn(message);
    }
    else if (level === 'error') {
        console.error(message);
    }
    else {
        console.log(message);
    }
}
export function log(level, msg, meta, context) {
    if (!shouldLog(level))
        return;
    const timestamp = new Date().toISOString();
    const format = getLogFormat();
    const output = format === 'json'
        ? formatJson({ timestamp, level, msg, requestId: context?.requestId, userId: context?.userId, clientIp: context?.clientIp, meta })
        : formatText({ timestamp, level, msg, requestId: context?.requestId, userId: context?.userId, clientIp: context?.clientIp, meta });
    write(level, output);
}
export function getLogger(context) {
    return {
        debug: (msg, meta) => log('debug', msg, meta, context),
        info: (msg, meta) => log('info', msg, meta, context),
        warn: (msg, meta) => log('warn', msg, meta, context),
        error: (msg, meta) => log('error', msg, meta, context)
    };
}
export const logger = getLogger();
