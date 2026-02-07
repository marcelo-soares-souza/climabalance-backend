import { env } from '../../shared/utils/env';
import { verifyJwt } from '../crypto/jwt';
import { errorResponse } from '../../shared/http/response';
import { getLogger } from '../../shared/utils/logger';
import { buildLogContext } from '../../shared/http/log-context';
function getToken(request) {
    const header = request.headers.get('authorization');
    if (!header)
        return null;
    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token)
        return null;
    return token;
}
export function withAuth(handler, options) {
    return async (ctx) => {
        const logContext = buildLogContext(ctx);
        const log = getLogger(logContext);
        const token = getToken(ctx.request);
        if (!token) {
            log.warn('auth.missing_token');
            return errorResponse(401, 'auth.required', undefined, logContext);
        }
        const payload = await verifyJwt(token, env.jwtSecret);
        if (!payload) {
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
export function withOptionalAuth(handler) {
    return async (ctx) => {
        const logContext = buildLogContext(ctx);
        const log = getLogger(logContext);
        const token = getToken(ctx.request);
        if (!token) {
            return handler(ctx);
        }
        const payload = await verifyJwt(token, env.jwtSecret);
        if (!payload) {
            log.warn('auth.invalid_token');
            return errorResponse(401, 'auth.invalid', undefined, logContext);
        }
        ctx.auth = { userId: payload.sub, roles: payload.roles };
        return handler(ctx);
    };
}
