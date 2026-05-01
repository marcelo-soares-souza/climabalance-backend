import { getLogger } from '../utils/logger';
import { uuidv7 } from '../utils/id';
import { env } from '../utils/env';
import { errorResponse } from './response';
import { buildLogContext } from './log-context';
import { parseContentLength, summarizeQueryForLog } from './log-summary';
import { serializeError } from '../utils/logger';

export type HttpContext = {
  request: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  requestId: string;
  clientIp?: string;
  routePath?: string;
  body?: unknown;
  auth?: {
    userId: string;
    roles: string[];
  };
};

export type Handler = (ctx: HttpContext) => Promise<Response> | Response;

export type HandleOptions = {
  clientIp?: string;
};

type Route = {
  method: string;
  path: string;
  regex: RegExp;
  paramNames: string[];
  handler: Handler;
};

function compilePath(path: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
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
  private routes: Route[] = [];

  add(method: string, path: string, handler: Handler): void {
    const { regex, paramNames } = compilePath(path);
    this.routes.push({ method: method.toUpperCase(), path, regex, paramNames, handler });
  }

  async handle(request: Request, options?: HandleOptions): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const requestId = uuidv7();
    const clientIp = getForwardedClientIp(request) ?? options?.clientIp;
    const corsHeaders = buildCorsHeaders(request);

    if (method === 'OPTIONS') {
      getLogger({ requestId, clientIp }).debug('request.completed', {
        method,
        path: url.pathname,
        route: 'preflight',
        status: 204,
        duration_ms: 0
      });
      applySecurityHeaders(corsHeaders);
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.regex.exec(url.pathname);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, index) => {
        params[name] = match[index + 1];
      });

      const ctx: HttpContext = {
        request,
        params,
        query: url.searchParams,
        requestId,
        clientIp,
        routePath: route.path
      };

      const startedAt = Date.now();
      const requestLogger = getLogger({ requestId, clientIp });
      requestLogger.info('request.started', {
        method,
        path: url.pathname,
        route: route.path,
        query: summarizeQueryForLog(url.searchParams),
        content_type: request.headers.get('content-type') ?? undefined,
        content_length: parseContentLength(request.headers.get('content-length')),
        user_agent: request.headers.get('user-agent') ?? undefined
      });
      try {
        const response = await route.handler(ctx);
        const headers = new Headers(response.headers);
        headers.set('x-request-id', requestId);
        applySecurityHeaders(headers);

        const durationMs = Date.now() - startedAt;
        const log = getLogger({ requestId, userId: ctx.auth?.userId, clientIp });
        const completionLevel = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info';
        log[completionLevel]('request.completed', {
          method,
          route: route.path,
          path: url.pathname,
          status: response.status,
          duration_ms: durationMs,
          response_content_type: headers.get('content-type') ?? undefined,
          response_content_length: parseContentLength(headers.get('content-length'))
        });

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: mergeHeaders(headers, corsHeaders)
        });
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        requestLogger.error('request.unhandled_error', {
          method,
          route: route.path,
          path: url.pathname,
          duration_ms: durationMs,
          error: serializeError(error)
        });
        return withCors(
          errorResponse(500, 'server.error', undefined, buildLogContext(ctx)),
          corsHeaders
        );
      }
    }

    getLogger({ requestId, clientIp }).warn('request.completed', {
      method,
      path: url.pathname,
      route: 'unmatched',
      status: 404,
      duration_ms: 0
    });
    return withCors(
      errorResponse(404, 'common.notFound', undefined, { requestId, clientIp }),
      corsHeaders
    );
  }
}

function getForwardedClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  return undefined;
}

function buildCorsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get('origin');
  const requestHeaders = request.headers.get('access-control-request-headers');
  const requestMethod = request.headers.get('access-control-request-method');

  const allowedOrigin = resolveAllowedOrigin(origin);
  if (allowedOrigin) {
    headers.set('access-control-allow-origin', allowedOrigin);
    headers.set('vary', 'origin');
    if (allowedOrigin !== '*') {
      headers.set('access-control-allow-credentials', 'true');
    }
  }
  headers.set(
    'access-control-allow-methods',
    requestMethod ?? 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  headers.set('access-control-allow-headers', requestHeaders ?? 'authorization, content-type');
  headers.set('access-control-max-age', '86400');
  return headers;
}

function resolveAllowedOrigin(origin: string | null): string | null {
  if (!origin) {
    return '*';
  }

  const allowedOrigins = new Set<string>();
  for (const candidate of [env.frontendUrl, env.appUrl]) {
    try {
      allowedOrigins.add(new URL(candidate).origin);
    } catch {
      // Invalid configured origin; fail closed for browser CORS.
    }
  }

  return allowedOrigins.has(origin) ? origin : null;
}

function mergeHeaders(base: Headers, extra: Headers): Headers {
  const merged = new Headers(base);
  extra.forEach((value, key) => merged.set(key, value));
  return merged;
}

function withCors(response: Response, corsHeaders: Headers): Response {
  const headers = mergeHeaders(response.headers, corsHeaders);
  applySecurityHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function applySecurityHeaders(headers: Headers): void {
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('cross-origin-resource-policy', 'same-site');
}
