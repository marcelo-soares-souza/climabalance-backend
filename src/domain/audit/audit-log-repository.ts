export type AuditLogEntry = {
  id: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  createdAt: Date;
};

export type AuditLogFilters = {
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
};

export interface AuditLogRepository {
  list(filters: AuditLogFilters): Promise<AuditLogEntry[]>;
}
