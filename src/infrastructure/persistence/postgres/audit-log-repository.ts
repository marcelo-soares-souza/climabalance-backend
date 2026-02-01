import type { Pool, PoolClient } from 'pg';
import type { AuditLogEntry, AuditLogFilters, AuditLogRepository } from '../../../domain/audit/audit-log-repository';
import { pgPool } from './pg-client';

function mapAuditLog(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as string,
    actorUserId: row.actor_user_id as string | null | undefined,
    action: row.action as string,
    entityType: row.entity_type as string,
    entityId: row.entity_id as string | null | undefined,
    reason: row.reason as string | null | undefined,
    createdAt: new Date(row.created_at as string)
  };
}

export class PostgresAuditLogRepository implements AuditLogRepository {
  constructor(private db: Pool | PoolClient = pgPool) {}

  async create(entry: AuditLogEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_log (
        id, actor_user_id, action, entity_type, entity_id, reason,
        created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, NULL)`,
      [
        entry.id,
        entry.actorUserId ?? null,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.reason ?? null,
        entry.createdAt
      ]
    );
  }

  async list(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const values: unknown[] = [];
    let index = 1;

    if (filters.actorUserId) {
      conditions.push(`actor_user_id = $${index++}`);
      values.push(filters.actorUserId);
    }
    if (filters.entityType) {
      conditions.push(`entity_type = $${index++}`);
      values.push(filters.entityType);
    }
    if (filters.entityId) {
      conditions.push(`entity_id = $${index++}`);
      values.push(filters.entityId);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    values.push(limit, offset);

    const result = await this.db.query(
      `SELECT * FROM audit_log
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${index++} OFFSET $${index++}`,
      values
    );
    return result.rows.map(mapAuditLog);
  }
}
