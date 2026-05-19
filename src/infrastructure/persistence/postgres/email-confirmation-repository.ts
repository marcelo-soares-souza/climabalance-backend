import type {
  EmailConfirmation,
  EmailConfirmationRepository,
} from "../../../domain/user/email-confirmation-repository";
import type { DbClient } from "./db-client";

function mapConfirmation(row: Record<string, unknown>): EmailConfirmation {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tokenHash: row.token_hash as string,
    sentAt: row.sent_at ? new Date(row.sent_at as string) : null,
    expiresAt: new Date(row.expires_at as string),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
  };
}

export class PostgresEmailConfirmationRepository implements EmailConfirmationRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: EmailConfirmation): Promise<EmailConfirmation> {
    const result = await this.db.query(
      `INSERT INTO email_confirmations (
        id, user_id, token_hash, sent_at, expires_at, confirmed_at, created_at, updated_at, deleted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        input.id,
        input.userId,
        input.tokenHash,
        input.sentAt ?? null,
        input.expiresAt,
        input.confirmedAt ?? null,
        input.createdAt,
        input.updatedAt,
        input.deletedAt ?? null,
      ],
    );
    return mapConfirmation(result.rows[0]);
  }

  async findByTokenHash(tokenHash: string): Promise<EmailConfirmation | null> {
    const result = await this.db.query(
      `SELECT * FROM email_confirmations WHERE token_hash = $1 AND deleted_at IS NULL`,
      [tokenHash],
    );
    if (result.rowCount === 0) return null;
    return mapConfirmation(result.rows[0]);
  }

  async markConfirmed(
    id: string,
    confirmedAt: Date,
  ): Promise<EmailConfirmation | null> {
    const result = await this.db.query(
      `UPDATE email_confirmations SET confirmed_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [confirmedAt, id],
    );
    if (result.rowCount === 0) return null;
    return mapConfirmation(result.rows[0]);
  }
}
