import type { Pool, PoolClient } from 'pg';
import type { AuditLogEntry, AuditLogFilters, AuditLogRepository } from '../../../domain/audit/audit-log-repository';
import { pgPool } from './pg-client';

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
    createdAt: new Date(row.created_at as string)
  };
}

export class PostgresAuditLogRepository implements AuditLogRepository {
  constructor(private db: Pool | PoolClient = pgPool) {}

  async log(entry: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, any>;
    actorEmail?: string;
    clientIp?: string;
  }): Promise<void> {
    const reason =
      entry.metadata?.reason !== undefined
        ? String(entry.metadata.reason)
        : entry.metadata
          ? JSON.stringify(entry.metadata)
          : null;

    await this.create({
      id: crypto.randomUUID(),
      actorUserId: entry.actorUserId ?? null,
      actorEmail: entry.actorEmail ?? null,
      clientIp: entry.clientIp ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      reason,
      createdAt: new Date()
    });
  }

  async create(entry: AuditLogEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_log (
        id, actor_user_id, actor_email, client_ip, action, entity_type, entity_id, reason,
        created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, NULL)`,
      [
        entry.id,
        entry.actorUserId ?? null,
        entry.actorEmail ?? null,
        entry.clientIp ?? null,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.reason ?? null,
        entry.createdAt
      ]
    );
  }

  async list(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    const conditions: string[] = ['al.deleted_at IS NULL'];
    const values: unknown[] = [];
    let index = 1;

    if (filters.actorUserId) {
      conditions.push(`al.actor_user_id = $${index++}`);
      values.push(filters.actorUserId);
    }
    if (filters.entityType) {
      conditions.push(`al.entity_type = $${index++}`);
      values.push(filters.entityType);
    }
    if (filters.entityId) {
      conditions.push(`al.entity_id = $${index++}`);
      values.push(filters.entityId);
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
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT $${index++} OFFSET $${index++}`,
      values
    );
    return result.rows.map(mapAuditLog);
  }
}
