export type AuditLogEntry = {
  id: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  clientIp?: string | null;
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
  create(entry: AuditLogEntry): Promise<void>;
  list(filters: AuditLogFilters): Promise<AuditLogEntry[]>;
}
