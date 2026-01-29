import { getLogger } from '../utils/logger';
import { uuidv7 } from '../utils/id';
import { errorResponse } from './response';

export type HttpContext = {
  request: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  requestId: string;
  clientIp?: string;
  body?: unknown;
  auth?: {
    userId: string;
    roles: string[];
  };
};

export type Handler = (ctx: HttpContext) => Promise<Response> | Response;

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

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const requestId = uuidv7();
    const clientIp = getClientIp(request);

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
          headers
        });
      } catch (error) {
        logger.error('request.unhandled_error', {
          method,
          path: url.pathname,
          error: error instanceof Error ? error.message : 'unknown'
        });
        return errorResponse(500, 'server.error');
      }
    }

    return new Response('Not Found', { status: 404 });
  }
}

function getClientIp(request: Request): string | undefined {
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
