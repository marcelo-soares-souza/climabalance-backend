import type { AuditLogFilters, AuditLogRepository } from '../../domain/audit/audit-log-repository';

export async function listAuditLog(filters: AuditLogFilters, deps: { auditLog: AuditLogRepository }) {
  return deps.auditLog.list(filters);
}
