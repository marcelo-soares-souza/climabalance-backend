import type { HttpContext } from './router';
import type { LogContext } from '../utils/logger';

export function buildLogContext(ctx: HttpContext): LogContext {
  return {
    requestId: ctx.requestId,
    userId: ctx.auth?.userId,
    clientIp: ctx.clientIp
  };
}
