import type {
  RefreshTokenRepository,
  RefreshToken,
} from "../../../domain/user/refresh-token-repository";
import type { DbClient } from "./db-client";

function mapRow(row: Record<string, unknown>): RefreshToken {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tokenHash: row.token_hash as string,
    expiresAt: new Date(row.expires_at as string),
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
    fingerprintHash: (row.fingerprint_hash as string) ?? null,
    userAgent: (row.user_agent as string) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
  };
}

export class PostgresRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: RefreshToken): Promise<RefreshToken> {
    const result = await this.db.query(
      `INSERT INTO refresh_tokens (
        id, user_id, token_hash, expires_at, revoked_at,
        fingerprint_hash, user_agent, created_at, updated_at, deleted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        input.id,
        input.userId,
        input.tokenHash,
        input.expiresAt,
        input.revokedAt ?? null,
        input.fingerprintHash ?? null,
        input.userAgent ?? null,
        input.createdAt,
        input.updatedAt,
        input.deletedAt ?? null,
      ],
    );
    return mapRow(result.rows[0]);
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const result = await this.db.query(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND deleted_at IS NULL`,
      [tokenHash],
    );
    if (result.rowCount === 0) return null;
    return mapRow(result.rows[0]);
  }

  async findActiveByUserId(userId: string): Promise<RefreshToken[]> {
    const result = await this.db.query(
      `SELECT * FROM refresh_tokens
       WHERE user_id = $1 AND revoked_at IS NULL
         AND expires_at > NOW() AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map(mapRow);
  }

  async revoke(id: string, revokedAt: Date): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
      [revokedAt, id],
    );
  }

  async revokeAllByUserId(userId: string, revokedAt: Date): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = $1, updated_at = $1 WHERE user_id = $2 AND revoked_at IS NULL AND deleted_at IS NULL`,
      [revokedAt, userId],
    );
  }
}
