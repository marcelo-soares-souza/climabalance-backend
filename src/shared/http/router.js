import { getLogger } from '../utils/logger';
import { uuidv7 } from '../utils/id';
import { errorResponse } from './response';
import { buildLogContext } from './log-context';
function compilePath(path) {
    const paramNames = [];
    const regexPath = path
        .split('/')
        .map((segment) => {
        if (segment.startsWith(':')) {
            paramNames.push(segment.slice(1));
            return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
        .join('/');
    return { regex: new RegExp(`^${regexPath}$`), paramNames };
}
export class Router {
    routes = [];
    add(method, path, handler) {
        const { regex, paramNames } = compilePath(path);
        this.routes.push({ method: method.toUpperCase(), path, regex, paramNames, handler });
    }
    async handle(request) {
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const requestId = uuidv7();
        const clientIp = getClientIp(request);
        const corsHeaders = buildCorsHeaders(request);
        if (method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });
        }
        for (const route of this.routes) {
            if (route.method !== method)
                continue;
            const match = route.regex.exec(url.pathname);
            if (!match)
                continue;
            const params = {};
            route.paramNames.forEach((name, index) => {
                params[name] = match[index + 1];
            });
            const ctx = {
                request,
                params,
                query: url.searchParams,
                requestId,
                clientIp
            };
            const logger = getLogger({ requestId, clientIp });
            try {
                const response = await route.handler(ctx);
                const headers = new Headers(response.headers);
                headers.set('x-request-id', requestId);
                const log = getLogger({ requestId, userId: ctx.auth?.userId, clientIp });
                log.info('request.completed', {
                    method,
                    path: url.pathname,
                    status: response.status
                });
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: mergeHeaders(headers, corsHeaders)
                });
            }
            catch (error) {
                logger.error('request.unhandled_error', {
                    method,
                    path: url.pathname,
                    error: error instanceof Error ? error.message : 'unknown'
                });
                return withCors(errorResponse(500, 'server.error', undefined, buildLogContext(ctx)), corsHeaders);
            }
        }
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
}
function getClientIp(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first)
            return first;
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp)
        return realIp;
    const cfIp = request.headers.get('cf-connecting-ip');
    if (cfIp)
        return cfIp;
    return undefined;
}
function buildCorsHeaders(request) {
    const headers = new Headers();
    const origin = request.headers.get('origin') ?? '*';
    const requestHeaders = request.headers.get('access-control-request-headers');
    const requestMethod = request.headers.get('access-control-request-method');
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', requestMethod ?? 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    headers.set('access-control-allow-headers', requestHeaders ?? 'authorization, content-type');
    headers.set('access-control-max-age', '86400');
    if (origin !== '*') {
        headers.set('vary', 'origin');
    }
    return headers;
}
function mergeHeaders(base, extra) {
    const merged = new Headers(base);
    extra.forEach((value, key) => merged.set(key, value));
    return merged;
}
function withCors(response, corsHeaders) {
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: mergeHeaders(response.headers, corsHeaders)
    });
}
