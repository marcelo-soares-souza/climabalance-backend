import type { Handler, HttpContext } from '../../shared/http/router';
import { env } from '../../shared/utils/env';
import { verifyJwt } from '../crypto/jwt';
import { errorResponse } from '../../shared/http/response';
import { getLogger } from '../../shared/utils/logger';

function getToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
}

export function withAuth(handler: Handler, options?: { roles?: string[] }): Handler {
  return async (ctx: HttpContext) => {
    const log = getLogger({ requestId: ctx.requestId, clientIp: ctx.clientIp });
    const token = getToken(ctx.request);
    if (!token) {
      log.warn('auth.missing_token');
      return errorResponse(401, 'auth.required');
    }

    const payload = await verifyJwt(token, env.jwtSecret);
    if (!payload) {
      log.warn('auth.invalid_token');
      return errorResponse(401, 'auth.invalid');
    }

    ctx.auth = { userId: payload.sub, roles: payload.roles };

    if (options?.roles && options.roles.length > 0) {
      const hasRole = options.roles.some((role) => payload.roles.includes(role));
      if (!hasRole) {
        log.warn('auth.forbidden', { user_id: payload.sub });
        return errorResponse(403, 'auth.forbidden');
      }
    }

    return handler(ctx);
  };
}
