import { pgPool } from './pg-client';
function mapConfirmation(row) {
    return {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        sentAt: row.sent_at ? new Date(row.sent_at) : null,
        expiresAt: new Date(row.expires_at),
        confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        deletedAt: row.deleted_at ? new Date(row.deleted_at) : null
    };
}
export class PostgresEmailConfirmationRepository {
    db;
    constructor(db = pgPool) {
        this.db = db;
    }
    async create(input) {
        const result = await this.db.query(`INSERT INTO email_confirmations (
        id, user_id, token_hash, sent_at, expires_at, confirmed_at, created_at, updated_at, deleted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [
            input.id,
            input.userId,
            input.tokenHash,
            input.sentAt ?? null,
            input.expiresAt,
            input.confirmedAt ?? null,
            input.createdAt,
            input.updatedAt,
            input.deletedAt ?? null
        ]);
        return mapConfirmation(result.rows[0]);
    }
    async findByTokenHash(tokenHash) {
        const result = await this.db.query(`SELECT * FROM email_confirmations WHERE token_hash = $1 AND deleted_at IS NULL`, [tokenHash]);
        if (result.rowCount === 0)
            return null;
        return mapConfirmation(result.rows[0]);
    }
    async markConfirmed(id, confirmedAt) {
        const result = await this.db.query(`UPDATE email_confirmations SET confirmed_at = $1, updated_at = $1 WHERE id = $2 RETURNING *`, [confirmedAt, id]);
        if (result.rowCount === 0)
            return null;
        return mapConfirmation(result.rows[0]);
    }
}
