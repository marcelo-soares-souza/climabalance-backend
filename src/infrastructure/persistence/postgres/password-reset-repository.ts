import type { PasswordResetRepository, PasswordResetToken } from '../../../domain/user/password-reset-repository';
import type { DbClient } from './db-client';

function mapResetToken(row: Record<string, unknown>): PasswordResetToken {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tokenHash: row.token_hash as string,
    sentAt: row.sent_at ? new Date(row.sent_at as string) : null,
    expiresAt: new Date(row.expires_at as string),
    usedAt: row.used_at ? new Date(row.used_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null
  };
}

export class PostgresPasswordResetRepository implements PasswordResetRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: PasswordResetToken): Promise<PasswordResetToken> {
    const result = await this.db.query(
      `INSERT INTO password_reset_tokens (
        id, user_id, token_hash, sent_at, expires_at, used_at, created_at, updated_at, deleted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        input.id,
        input.userId,
        input.tokenHash,
        input.sentAt ?? null,
        input.expiresAt,
        input.usedAt ?? null,
        input.createdAt,
        input.updatedAt,
        input.deletedAt ?? null
      ]
    );
    return mapResetToken(result.rows[0]);
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const result = await this.db.query(
      `SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND deleted_at IS NULL`,
      [tokenHash]
    );
    if (result.rowCount === 0) return null;
    return mapResetToken(result.rows[0]);
  }

  async markUsed(id: string, usedAt: Date): Promise<PasswordResetToken | null> {
    const result = await this.db.query(
      `UPDATE password_reset_tokens SET used_at = $1, updated_at = $1 WHERE id = $2 RETURNING *`,
      [usedAt, id]
    );
    if (result.rowCount === 0) return null;
    return mapResetToken(result.rows[0]);
  }
}
