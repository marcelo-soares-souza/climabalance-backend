import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { HttpContext } from '../../shared/http/router';
import { jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
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
  severity: z.enum(['debug', 'info', 'warning', 'error', 'critical']).optional(),
  is_sensitive: z.coerce.boolean().optional(),
  created_at_from: z.string().trim().min(1).optional(),
  created_at_to: z.string().trim().min(1).optional(),
  format: z.enum(['csv', 'json']).optional(),
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

        const filters = {
          actorUserId: query.actor_user_id,
          actorEmail: query.actor_email,
          action: query.action,
          clientIp: query.client_ip,
          entityType: query.entity_type,
          entityId: query.entity_id,
          severity: query.severity,
          isSensitive: query.is_sensitive,
          createdAtFrom: query.created_at_from,
          createdAtTo: query.created_at_to,
          limit: query.limit,
          offset: query.offset,
        };

        const { entries, total } = await deps.auditLog.listWithTotal(filters);

        log.info('audit.list', { count: entries.length, total });
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
              user_agent: entry.userAgent ?? null,
              request_id: entry.requestId ?? null,
              success: entry.success ?? true,
              error_code: entry.errorCode ?? null,
              http_status: entry.httpStatus ?? null,
              country_code: entry.countryCode ?? null,
              city: entry.city ?? null,
              severity: entry.severity ?? 'info',
              category: entry.category ?? null,
              is_sensitive: entry.isSensitive ?? false,
              previous_state: entry.previousState ?? null,
              new_state: entry.newState ?? null,
              changed_fields: entry.changedFields ?? null,
              duration_ms: entry.durationMs ?? null,
              resource_changes: entry.resourceChanges ?? 0,
            })),
            pagination: {
              total,
              limit: filters.limit ?? 50,
              offset: filters.offset ?? 0,
            },
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    exportLogs: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const query = parseQueryWithSchema(listAuditLogQuerySchema, ctx.query);
        const format = query.format ?? 'json';
        const filters = {
          actorUserId: query.actor_user_id,
          actorEmail: query.actor_email,
          action: query.action,
          clientIp: query.client_ip,
          entityType: query.entity_type,
          entityId: query.entity_id,
          severity: query.severity,
          isSensitive: query.is_sensitive,
          createdAtFrom: query.created_at_from,
          createdAtTo: query.created_at_to,
        };

        const { entries } = await deps.auditLog.listWithTotal(filters);

        log.info('audit.export', { format, count: entries.length });

        if (format === 'csv') {
          const header = 'id,actor_user_id,actor_email,client_ip,action,entity_type,entity_id,severity,success,http_status,created_at';
          const escape = (v: unknown): string => {
            const s = String(v ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
          };
          const rows = entries.map((e) =>
            [e.id, e.actorUserId, e.actorEmail, e.clientIp, e.action, e.entityType, e.entityId, e.severity, e.success, e.httpStatus, e.createdAt.toISOString()].map(escape).join(',')
          );
          const body = [header, ...rows].join('\n');
          return new Response(body, {
            status: 200,
            headers: {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': 'attachment; filename="audit-log-export.csv"',
            },
          });
        }

        return jsonResponse(200, { data: entries }, logContext, {
          'content-disposition': 'attachment; filename="audit-log-export.json"',
        });
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    verifyChain: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const result = await deps.auditLog.verifyChain();
        log.info('audit.verify_chain', result);
        return jsonResponse(200, { data: result }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    }
  };
}
