import type {
  AuditLogEntry,
  AuditLogFilters,
  AuditLogRepository,
  AuditLogSeverity,
} from "../../../domain/audit/audit-log-repository";
import type { AlertNotifier } from "../../alerts/alert-notifier";
import { shouldAlert } from "../../alerts/alert-notifier";
import { env } from "../../../shared/utils/env";
import type { DbClient } from "./db-client";

const encoder = new TextEncoder();

async function computeEntryHash(
  id: string,
  action: string,
  entityType: string,
  entityId: string | null | undefined,
  createdAt: Date,
  previousEntryHash: string | null | undefined,
): Promise<string> {
  const data = `${id}${action}${entityType}${entityId ?? ""}${createdAt.toISOString()}${previousEntryHash ?? ""}`;
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(data),
  );
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getLastEntryHash(db: DbClient): Promise<string> {
  const result = await db.query(
    "SELECT previous_entry_hash, id, action, entity_type, entity_id, created_at FROM audit_log WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1",
  );
  if (result.rows.length === 0) return "0".repeat(64);
  const row = result.rows[0];
  return computeEntryHash(
    row.id as string,
    row.action as string,
    row.entity_type as string,
    row.entity_id as string | null,
    new Date(row.created_at as string),
    row.previous_entry_hash as string | null,
  );
}

/**
 * Sanitize sensitive fields from state objects before storing in audit log.
 * Prevents leaking passwords, tokens, API keys, etc.
 */
function sanitizeState(
  state: Record<string, any> | null | undefined,
): Record<string, any> | null {
  if (!state || typeof state !== "object") return null;

  const sensitiveFields = [
    "password",
    "passwd",
    "pwd",
    "token",
    "access_token",
    "refresh_token",
    "api_key",
    "apiKey",
    "secret",
    "private_key",
    "privateKey",
    "cvv",
    "card_number",
    "cardNumber",
    "ssn",
    "cpf",
    "cnpj",
  ];

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(state)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some((sensitive) => lowerKey.includes(sensitive))) {
      sanitized[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeState(value as Record<string, any>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function mapAuditLog(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as string,
    actorUserId: row.actor_user_id as string | null | undefined,
    actorEmail: row.actor_email as string | null | undefined,
    clientIp: row.client_ip as string | null | undefined,
    action: row.action as string,
    entityType: row.entity_type as string,
    entityId: row.entity_id as string | null | undefined,
    reason: row.reason as string | null | undefined,
    createdAt: new Date(row.created_at as string),

    // Request context
    userAgent: row.user_agent as string | null | undefined,
    requestId: row.request_id as string | null | undefined,
    sessionId: row.session_id as string | null | undefined,
    referer: row.referer as string | null | undefined,

    // Operation result
    success: row.success as boolean | undefined,
    errorCode: row.error_code as string | null | undefined,
    httpStatus: row.http_status as number | null | undefined,

    // Geolocation
    countryCode: row.country_code as string | null | undefined,
    city: row.city as string | null | undefined,
    timezone: row.timezone as string | null | undefined,

    // Criticality
    severity: row.severity as AuditLogSeverity | undefined,
    category: row.category as string[] | null | undefined,
    isSensitive: row.is_sensitive as boolean | undefined,

    // State tracking
    previousState: row.previous_state as Record<string, any> | null | undefined,
    newState: row.new_state as Record<string, any> | null | undefined,
    changedFields: row.changed_fields as string[] | null | undefined,

    // Performance
    durationMs: row.duration_ms as number | null | undefined,
    resourceChanges: row.resource_changes as number | undefined,
    // Hash chain integrity
    previousEntryHash: row.previous_entry_hash as string | null | undefined,
  };
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeActorUserId(
  actorUserId: string | null | undefined,
): string | null {
  if (!actorUserId) return null;
  return isUuidLike(actorUserId) ? actorUserId : null;
}

export class PostgresAuditLogRepository implements AuditLogRepository {
  constructor(
    private readonly db: DbClient,
    private readonly alertNotifier?: AlertNotifier,
  ) {}

  async log(entry: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, any>;
    ctx?: any; // HttpContext (optional, for automatic extraction)
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
  }): Promise<void> {
    const reason =
      entry.metadata?.reason !== undefined
        ? String(entry.metadata.reason)
        : entry.metadata
          ? JSON.stringify(entry.metadata)
          : null;

    // Auto-extract context from HttpContext if provided
    let autoContext: any = {};
    if (entry.ctx) {
      const headers = entry.ctx.request?.headers;
      autoContext = {
        clientIp:
          entry.ctx.clientIp ??
          headers?.get("x-real-ip") ??
          headers?.get("x-forwarded-for")?.split(",")[0],
        userAgent: headers?.get("user-agent"),
        requestId: entry.ctx.requestId,
        referer: headers?.get("referer") ?? headers?.get("referrer"),
      };
    }

    const logEntry: AuditLogEntry = {
      id: crypto.randomUUID(),
      actorUserId: normalizeActorUserId(entry.actorUserId),
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      reason,
      createdAt: new Date(),
      // Request context (manual overrides take precedence over auto-extracted)
      clientIp: entry.clientIp ?? autoContext.clientIp ?? null,
      userAgent: entry.userAgent ?? autoContext.userAgent ?? null,
      requestId: entry.requestId ?? autoContext.requestId ?? null,
      referer: entry.referer ?? autoContext.referer ?? null,
      sessionId: entry.sessionId,
      // Operation result
      success: entry.success,
      errorCode: entry.errorCode,
      httpStatus: entry.httpStatus,
      // Geolocation
      countryCode: entry.countryCode,
      city: entry.city,
      timezone: entry.timezone,
      // Criticality
      severity: entry.severity,
      category: entry.category,
      isSensitive: entry.isSensitive,
      // State tracking
      previousState: entry.previousState,
      newState: entry.newState,
      changedFields: entry.changedFields,
      // Performance
      durationMs: entry.durationMs,
      resourceChanges: entry.resourceChanges,
    };

    await this.create(logEntry);

    if (
      this.alertNotifier &&
      shouldAlert(logEntry, env.alertSeverityThreshold)
    ) {
      this.alertNotifier.notify(logEntry).catch(() => {});
    }
  }

  async create(entry: AuditLogEntry): Promise<void> {
    // Sanitize state objects to prevent leaking sensitive data
    const sanitizedPreviousState = sanitizeState(entry.previousState);
    const sanitizedNewState = sanitizeState(entry.newState);

    // Compute hash chain: get the hash of the last entry
    const lastHash =
      entry.previousEntryHash ?? (await getLastEntryHash(this.db));

    await this.db.query(
      `INSERT INTO audit_log (
        id, actor_user_id, actor_email, client_ip, action, entity_type, entity_id, reason,
        user_agent, request_id, session_id, referer,
        success, error_code, http_status,
        country_code, city, timezone,
        severity, category, is_sensitive,
        previous_state, new_state, changed_fields,
        duration_ms, resource_changes,
        previous_entry_hash,
        created_at, updated_at, deleted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18,
        $19, $20, $21,
        $22, $23, $24,
        $25, $26,
        $27,
        $28, $28, NULL
      )`,
      [
        entry.id,
        entry.actorUserId ?? null,
        entry.actorEmail ?? null,
        entry.clientIp ?? null,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.reason ?? null,
        // Request context
        entry.userAgent ?? null,
        entry.requestId ?? null,
        entry.sessionId ?? null,
        entry.referer ?? null,
        // Operation result
        entry.success ?? true,
        entry.errorCode ?? null,
        entry.httpStatus ?? null,
        // Geolocation
        entry.countryCode ?? null,
        entry.city ?? null,
        entry.timezone ?? null,
        // Criticality
        entry.severity ?? "info",
        entry.category ?? null,
        entry.isSensitive ?? false,
        // State tracking (sanitized)
        sanitizedPreviousState ? JSON.stringify(sanitizedPreviousState) : null,
        sanitizedNewState ? JSON.stringify(sanitizedNewState) : null,
        entry.changedFields ?? null,
        // Performance
        entry.durationMs ?? null,
        entry.resourceChanges ?? 0,
        // Hash chain
        lastHash,
        // Timestamps
        entry.createdAt,
      ],
    );
  }

  async verifyChain(): Promise<{
    valid: boolean;
    totalEntries: number;
    verifiedEntries: number;
    firstBrokenEntry?: string;
  }> {
    const result = await this.db.query(
      `SELECT id, action, entity_type, entity_id, created_at, previous_entry_hash
       FROM audit_log
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC, id ASC`,
    );

    const rows = result.rows as Array<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      created_at: string;
      previous_entry_hash: string | null;
    }>;

    let verifiedEntries = 0;
    let expectedHash = "0".repeat(64);

    for (const row of rows) {
      if (row.previous_entry_hash === null) {
        expectedHash = "0".repeat(64);
        continue;
      }

      if (row.previous_entry_hash !== expectedHash) {
        return {
          valid: false,
          totalEntries: rows.length,
          verifiedEntries,
          firstBrokenEntry: row.id,
        };
      }

      expectedHash = await computeEntryHash(
        row.id,
        row.action,
        row.entity_type,
        row.entity_id,
        new Date(row.created_at),
        row.previous_entry_hash,
      );
      verifiedEntries++;
    }

    return { valid: true, totalEntries: rows.length, verifiedEntries };
  }

  async archive(
    retentionDays: number,
    archiveDays: number,
  ): Promise<{ archived: number; deleted: number }> {
    const now = new Date();
    const archiveThreshold = new Date(
      now.getTime() - archiveDays * 24 * 60 * 60 * 1000,
    );
    const deleteThreshold = new Date(
      now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );

    const { rows: toArchive } = await this.db.query(
      `INSERT INTO audit_log_archive (
        id, actor_user_id, actor_email, client_ip, action, entity_type, entity_id, reason,
        user_agent, request_id, session_id, referer,
        success, error_code, http_status,
        country_code, city, timezone,
        severity, category, is_sensitive,
        previous_state, new_state, changed_fields,
        duration_ms, resource_changes, previous_entry_hash,
        created_at, updated_at, deleted_at
      )
      SELECT
        id, actor_user_id, actor_email, client_ip, action, entity_type, entity_id, reason,
        user_agent, request_id, session_id, referer,
        success, error_code, http_status,
        country_code, city, timezone,
        severity, category, is_sensitive,
        previous_state, new_state, changed_fields,
        duration_ms, resource_changes, previous_entry_hash,
        created_at, updated_at, deleted_at
      FROM audit_log
      WHERE deleted_at IS NULL AND created_at < $1
      RETURNING id`,
      [archiveThreshold],
    );

    const archivedCount = toArchive.length;

    if (archivedCount > 0) {
      await this.db.query(
        `DELETE FROM audit_log WHERE id = ANY($1::varchar[])`,
        [toArchive.map((r: any) => r.id)],
      );
    }

    const { rows: toDelete } = await this.db.query(
      `DELETE FROM audit_log_archive WHERE created_at < $1 RETURNING id`,
      [deleteThreshold],
    );

    return { archived: archivedCount, deleted: toDelete.length };
  }

  async listWithTotal(
    filters: AuditLogFilters,
  ): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const conditions: string[] = ["al.deleted_at IS NULL"];
    const values: unknown[] = [];
    let index = 1;

    if (filters.actorUserId) {
      conditions.push(`al.actor_user_id = $${index++}`);
      values.push(filters.actorUserId);
    }
    if (filters.actorEmail) {
      conditions.push(
        `(al.actor_email ILIKE $${index} OR u.email ILIKE $${index})`,
      );
      values.push(`%${filters.actorEmail}%`);
      index++;
    }
    if (filters.action) {
      conditions.push(`al.action ILIKE $${index++}`);
      values.push(`%${filters.action}%`);
    }
    if (filters.clientIp) {
      conditions.push(`al.client_ip ILIKE $${index++}`);
      values.push(`%${filters.clientIp}%`);
    }
    if (filters.entityType) {
      conditions.push(`al.entity_type = $${index++}`);
      values.push(filters.entityType);
    }
    if (filters.entityId) {
      conditions.push(`al.entity_id = $${index++}`);
      values.push(filters.entityId);
    }
    if (filters.severity) {
      conditions.push(`al.severity = $${index++}`);
      values.push(filters.severity);
    }
    if (filters.isSensitive !== undefined) {
      conditions.push(`al.is_sensitive = $${index++}`);
      values.push(filters.isSensitive);
    }
    if (filters.createdAtFrom) {
      conditions.push(`al.created_at >= $${index++}`);
      values.push(filters.createdAtFrom);
    }
    if (filters.createdAtTo) {
      conditions.push(`al.created_at <= $${index++}`);
      values.push(filters.createdAtTo);
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await this.db.query(
      `SELECT COUNT(*) as total FROM audit_log al LEFT JOIN users u ON u.id = al.actor_user_id WHERE ${whereClause}`,
      values,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    values.push(limit, offset);

    const result = await this.db.query(
      `SELECT al.*, COALESCE(al.actor_email, u.email) as actor_email
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE ${whereClause}
       ORDER BY al.updated_at DESC, al.created_at DESC
       LIMIT $${index++} OFFSET $${index++}`,
      values,
    );

    return { entries: result.rows.map(mapAuditLog), total };
  }

  async list(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    const conditions: string[] = ["al.deleted_at IS NULL"];
    const values: unknown[] = [];
    let index = 1;

    if (filters.actorUserId) {
      conditions.push(`al.actor_user_id = $${index++}`);
      values.push(filters.actorUserId);
    }
    if (filters.actorEmail) {
      conditions.push(
        `(al.actor_email ILIKE $${index} OR u.email ILIKE $${index})`,
      );
      values.push(`%${filters.actorEmail}%`);
      index++;
    }
    if (filters.action) {
      conditions.push(`al.action ILIKE $${index++}`);
      values.push(`%${filters.action}%`);
    }
    if (filters.clientIp) {
      conditions.push(`al.client_ip ILIKE $${index++}`);
      values.push(`%${filters.clientIp}%`);
    }
    if (filters.entityType) {
      conditions.push(`al.entity_type = $${index++}`);
      values.push(filters.entityType);
    }
    if (filters.entityId) {
      conditions.push(`al.entity_id = $${index++}`);
      values.push(filters.entityId);
    }
    if (filters.severity) {
      conditions.push(`al.severity = $${index++}`);
      values.push(filters.severity);
    }
    if (filters.isSensitive !== undefined) {
      conditions.push(`al.is_sensitive = $${index++}`);
      values.push(filters.isSensitive);
    }
    if (filters.createdAtFrom) {
      conditions.push(`al.created_at >= $${index++}`);
      values.push(filters.createdAtFrom);
    }
    if (filters.createdAtTo) {
      conditions.push(`al.created_at <= $${index++}`);
      values.push(filters.createdAtTo);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    values.push(limit, offset);

    const result = await this.db.query(
      `SELECT
        al.*,
        COALESCE(al.actor_email, u.email) as actor_email
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY al.updated_at DESC, al.created_at DESC
       LIMIT $${index++} OFFSET $${index++}`,
      values,
    );
    return result.rows.map(mapAuditLog);
  }
}
