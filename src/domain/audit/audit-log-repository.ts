export type AuditLogSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

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

  // Request context
  userAgent?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  referer?: string | null;

  // Operation result
  success?: boolean;
  errorCode?: string | null;
  httpStatus?: number | null;

  // Geolocation
  countryCode?: string | null;
  city?: string | null;
  timezone?: string | null;

  // Criticality
  severity?: AuditLogSeverity;
  category?: string[] | null;
  isSensitive?: boolean;

  // State tracking
  previousState?: Record<string, any> | null;
  newState?: Record<string, any> | null;
  changedFields?: string[] | null;

  // Performance
  durationMs?: number | null;
  resourceChanges?: number;
};

export type AuditLogFilters = {
  actorUserId?: string;
  actorEmail?: string;
  action?: string;
  clientIp?: string;
  entityType?: string;
  entityId?: string;
  severity?: AuditLogSeverity;
  isSensitive?: boolean;
  limit?: number;
  offset?: number;
};

export interface AuditLogRepository {
  create(entry: AuditLogEntry): Promise<void>;
  list(filters: AuditLogFilters): Promise<AuditLogEntry[]>;
  log(entry: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, any>;
    ctx?: any; // HttpContext (optional, for automatic extraction)
    // Optional manual overrides
    actorEmail?: string;
    clientIp?: string;
    userAgent?: string;
    requestId?: string;
    sessionId?: string;
    referer?: string;
    success?: boolean;
    errorCode?: string;
    httpStatus?: number;
    countryCode?: string;
    city?: string;
    timezone?: string;
    severity?: AuditLogSeverity;
    category?: string[];
    isSensitive?: boolean;
    previousState?: Record<string, any>;
    newState?: Record<string, any>;
    changedFields?: string[];
    durationMs?: number;
    resourceChanges?: number;
  }): Promise<void>;
}
