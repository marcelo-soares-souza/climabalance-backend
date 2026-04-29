import type { Handler, HttpContext } from '../../shared/http/router';
import { env } from '../../shared/utils/env';
import { type JwtPayload, verifyJwt } from '../crypto/jwt';
import { errorResponse } from '../../shared/http/response';
import { getLogger } from '../../shared/utils/logger';
import { buildLogContext } from '../../shared/http/log-context';

const CSRF_HEADER = 'x-requested-by';
const CSRF_EXPECTED = 'clm-balance';

function getToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
}

function requireCsrfCheck(request: Request): boolean {
  const method = request.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return false;
  const cookie = request.headers.get('cookie');
  if (!cookie || !cookie.includes(env.refreshCookieName)) return false;
  return true;
}

function isValidCsrf(request: Request): boolean {
  const header = request.headers.get(CSRF_HEADER);
  return header === CSRF_EXPECTED;
}

function isValidAuthPayload(payload: JwtPayload): boolean {
  if (!payload.sub || typeof payload.sub !== 'string') return false;
  if (!Array.isArray(payload.roles) || payload.roles.some((role) => typeof role !== 'string')) return false;
  if (payload.iss !== env.jwtIssuer || payload.aud !== env.jwtAudience) return false;
  return true;
}

export function withAuth(handler: Handler, options?: { roles?: string[] }): Handler {
  return async (ctx: HttpContext) => {
    const logContext = buildLogContext(ctx);
    const log = getLogger(logContext);

    if (requireCsrfCheck(ctx.request) && !isValidCsrf(ctx.request)) {
      log.warn('auth.csrf_missing');
      return errorResponse(400, 'request.csrf_required', undefined, logContext);
    }

    const token = getToken(ctx.request);
    if (!token) {
      log.warn('auth.missing_token');
      return errorResponse(401, 'auth.required', undefined, logContext);
    }

    const payload = await verifyJwt(token, env.jwtSecret, env.jwtKeys);
    if (!payload || !isValidAuthPayload(payload)) {
      log.warn('auth.invalid_token');
      return errorResponse(401, 'auth.invalid', undefined, logContext);
    }

    ctx.auth = { userId: payload.sub, roles: payload.roles };

    if (options?.roles && options.roles.length > 0) {
      const hasRole = options.roles.some((role) => payload.roles.includes(role));
      if (!hasRole) {
        log.warn('auth.forbidden', { user_id: payload.sub });
        return errorResponse(403, 'auth.forbidden', undefined, logContext);
      }
    }

    return handler(ctx);
  };
}

export function withOptionalAuth(handler: Handler): Handler {
  return async (ctx: HttpContext) => {
    const logContext = buildLogContext(ctx);
    const log = getLogger(logContext);

    if (requireCsrfCheck(ctx.request) && !isValidCsrf(ctx.request)) {
      log.warn('auth.csrf_missing');
      return errorResponse(400, 'request.csrf_required', undefined, logContext);
    }

    const token = getToken(ctx.request);
    if (!token) return handler(ctx);

    const payload = await verifyJwt(token, env.jwtSecret, env.jwtKeys);
    if (!payload || !isValidAuthPayload(payload)) {
      log.warn('auth.invalid_token');
      return errorResponse(401, 'auth.invalid', undefined, logContext);
    }

    ctx.auth = { userId: payload.sub, roles: payload.roles };
    return handler(ctx);
  };
}
