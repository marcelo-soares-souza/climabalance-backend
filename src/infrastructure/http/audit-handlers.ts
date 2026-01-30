import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { HttpContext } from '../../shared/http/router';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { listAuditLog } from '../../application/audit/list-audit-log';
import { getLogger } from '../../shared/utils/logger';

export type AuditHandlersDeps = {
  auditLog: AuditLogRepository;
};

export function createAuditHandlers(deps: AuditHandlersDeps) {
  return {
    list: async (ctx: HttpContext) => {
      const log = getLogger({ requestId: ctx.requestId, userId: ctx.auth?.userId, clientIp: ctx.clientIp });
      try {
        const url = new URL(ctx.request.url);
        const actorUserId = url.searchParams.get('actor_user_id') ?? undefined;
        const entityType = url.searchParams.get('entity_type') ?? undefined;
        const entityId = url.searchParams.get('entity_id') ?? undefined;
        const limitRaw = url.searchParams.get('limit');
        const offsetRaw = url.searchParams.get('offset');
        const limit = limitRaw ? Number(limitRaw) : undefined;
        const offset = offsetRaw ? Number(offsetRaw) : undefined;

        const errors: Array<{ field: string; message: string }> = [];
        if (limitRaw && (Number.isNaN(limit) || (limit ?? 0) <= 0)) {
          errors.push({ field: 'limit', message: 'invalid' });
        }
        if (offsetRaw && (Number.isNaN(offset) || (offset ?? 0) < 0)) {
          errors.push({ field: 'offset', message: 'invalid' });
        }

        if (errors.length > 0) {
          log.warn('audit.list.validation_failed', { errors });
          return errorResponse(400, 'request.validation_failed', errors);
        }

        const entries = await listAuditLog(
          {
            actorUserId,
            entityType,
            entityId,
            limit,
            offset
          },
          { auditLog: deps.auditLog }
        );

        log.info('audit.list', { count: entries.length });
        return jsonResponse(200, {
          data: entries.map((entry) => ({
            id: entry.id,
            actor_user_id: entry.actorUserId ?? null,
            action: entry.action,
            entity_type: entry.entityType,
            entity_id: entry.entityId ?? null,
            reason: entry.reason ?? null,
            created_at: entry.createdAt
          }))
        });
      } catch (error) {
        return handleError(error, log);
      }
    }
  };
}
