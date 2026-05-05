import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { HttpContext } from '../../shared/http/router';
import { jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { listAuditLog } from '../../application/audit/list-audit-log';
import { getLogger } from '../../shared/utils/logger';
import { buildLogContext } from '../../shared/http/log-context';
import { parseQueryWithSchema } from './schemas/validation-helper';
import { z } from 'zod';

const listAuditLogQuerySchema = z.object({
  actor_user_id: z.string().trim().min(1).optional(),
  actor_email: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  client_ip: z.string().trim().min(1).optional(),
  entity_type: z.string().trim().min(1).optional(),
  entity_id: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type AuditHandlersDeps = {
  auditLog: AuditLogRepository;
};

export function createAuditHandlers(deps: AuditHandlersDeps) {
  return {
    list: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const query = parseQueryWithSchema(listAuditLogQuerySchema, ctx.query);

        const entries = await listAuditLog(
          {
            actorUserId: query.actor_user_id,
            actorEmail: query.actor_email,
            action: query.action,
            clientIp: query.client_ip,
            entityType: query.entity_type,
            entityId: query.entity_id,
            limit: query.limit,
            offset: query.offset
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
