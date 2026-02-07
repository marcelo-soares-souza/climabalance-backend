import { pgPool } from './pg-client';
function mapAuditLog(row) {
    return {
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        reason: row.reason,
        createdAt: new Date(row.created_at)
    };
}
export class PostgresAuditLogRepository {
    db;
    constructor(db = pgPool) {
        this.db = db;
    }
    async log(entry) {
        const reason = entry.metadata?.reason !== undefined
            ? String(entry.metadata.reason)
            : entry.metadata
                ? JSON.stringify(entry.metadata)
                : null;
        await this.create({
            id: crypto.randomUUID(),
            actorUserId: entry.actorUserId ?? null,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId ?? null,
            reason,
            createdAt: new Date()
        });
    }
    async create(entry) {
        await this.db.query(`INSERT INTO audit_log (
        id, actor_user_id, action, entity_type, entity_id, reason,
        created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, NULL)`, [
            entry.id,
            entry.actorUserId ?? null,
            entry.action,
            entry.entityType,
            entry.entityId ?? null,
            entry.reason ?? null,
            entry.createdAt
        ]);
    }
    async list(filters) {
        const conditions = ['deleted_at IS NULL'];
        const values = [];
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
        const result = await this.db.query(`SELECT * FROM audit_log
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${index++} OFFSET $${index++}`, values);
        return result.rows.map(mapAuditLog);
    }
}
