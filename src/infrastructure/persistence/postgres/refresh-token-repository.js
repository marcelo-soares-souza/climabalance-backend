import { pgPool } from './pg-client';
function mapRow(row) {
    return {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: new Date(row.expires_at),
        revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    };
}
export class PostgresRefreshTokenRepository {
    db;
    constructor(db = pgPool) {
        this.db = db;
    }
    async create(input) {
        const result = await this.db.query(`INSERT INTO refresh_tokens (
        id, user_id, token_hash, expires_at, revoked_at, created_at, updated_at, deleted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [
            input.id,
            input.userId,
            input.tokenHash,
            input.expiresAt,
            input.revokedAt ?? null,
            input.createdAt,
            input.updatedAt,
            input.deletedAt ?? null,
        ]);
        return mapRow(result.rows[0]);
    }
    async findByTokenHash(tokenHash) {
        const result = await this.db.query(`SELECT * FROM refresh_tokens WHERE token_hash = $1 AND deleted_at IS NULL`, [tokenHash]);
        if (result.rowCount === 0)
            return null;
        return mapRow(result.rows[0]);
    }
    async revoke(id, revokedAt) {
        await this.db.query(`UPDATE refresh_tokens SET revoked_at = $1, updated_at = $1 WHERE id = $2`, [revokedAt, id]);
    }
    async revokeAllByUserId(userId, revokedAt) {
        await this.db.query(`UPDATE refresh_tokens SET revoked_at = $1, updated_at = $1 WHERE user_id = $2 AND revoked_at IS NULL AND deleted_at IS NULL`, [revokedAt, userId]);
    }
}
