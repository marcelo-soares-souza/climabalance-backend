import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { HttpContext } from '../../shared/http/router';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { listAuditLog } from '../../application/audit/list-audit-log';
import { getLogger } from '../../shared/utils/logger';
import { buildLogContext } from '../../shared/http/log-context';

export type AuditHandlersDeps = {
  auditLog: AuditLogRepository;
};

export function createAuditHandlers(deps: AuditHandlersDeps) {
  return {
    list: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
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
          return errorResponse(400, 'request.validation_failed', errors, logContext);
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
        return jsonResponse(
          200,
          {
            data: entries.map((entry) => ({
              id: entry.id,
              actor_user_id: entry.actorUserId ?? null,
              actor_email: entry.actorEmail ?? null,
              client_ip: entry.clientIp ?? null,
              action: entry.action,
              entity_type: entry.entityType,
              entity_id: entry.entityId ?? null,
              reason: entry.reason ?? null,
              created_at: entry.createdAt,
              // Request context
              user_agent: entry.userAgent ?? null,
              request_id: entry.requestId ?? null,
              // Operation result
              success: entry.success ?? true,
              error_code: entry.errorCode ?? null,
              http_status: entry.httpStatus ?? null,
              // Geolocation
              country_code: entry.countryCode ?? null,
              city: entry.city ?? null,
              // Criticality
              severity: entry.severity ?? 'info',
              category: entry.category ?? null,
              is_sensitive: entry.isSensitive ?? false,
              // State tracking
              previous_state: entry.previousState ?? null,
              new_state: entry.newState ?? null,
              changed_fields: entry.changedFields ?? null,
              // Performance
              duration_ms: entry.durationMs ?? null,
              resource_changes: entry.resourceChanges ?? 0,
            }))
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    }
  };
}
