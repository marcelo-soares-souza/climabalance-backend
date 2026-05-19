import type { AuditLogRepository } from "../../domain/audit/audit-log-repository";
import type { HttpContext } from "./router";

type AuditLogger = Pick<AuditLogRepository, "log">;

/**
 * Wraps an audit logger so all entries inherit the current HTTP context.
 * This ensures fields like client IP/request id are captured consistently.
 */
export function withAuditLogContext(
  auditLog: AuditLogger,
  ctx: HttpContext,
): AuditLogger {
  return {
    log(entry) {
      return auditLog.log({ ...entry, ctx });
    },
  };
}
