import type { DbClient } from './db-client';

export type StripeConnectAccountRecord = {
  id: string;
  userId: string;
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  country: string;
  createdAt: Date;
  updatedAt: Date;
};

export class PostgresStripeConnectRepository {
  constructor(private readonly db: DbClient) {}

  async findByUserId(
    userId: string
  ): Promise<StripeConnectAccountRecord | null> {
    const result = await this.db.query(
      `SELECT id, user_id, stripe_account_id, charges_enabled,
              payouts_enabled, country, created_at, updated_at
       FROM stripe_connect_accounts
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    return mapRow(row);
  }

  async create(record: {
    id: string;
    userId: string;
    stripeAccountId: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    country: string;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO stripe_connect_accounts (
         id, user_id, stripe_account_id, charges_enabled,
         payouts_enabled, country, created_at, updated_at, deleted_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)`,
      [
        record.id,
        record.userId,
        record.stripeAccountId,
        record.chargesEnabled,
        record.payoutsEnabled,
        record.country,
        record.createdAt,
        record.updatedAt,
      ]
    );
  }

  async updateStatus(
    id: string,
    chargesEnabled: boolean,
    payoutsEnabled: boolean,
    updatedAt: Date
  ): Promise<void> {
    await this.db.query(
      `UPDATE stripe_connect_accounts
       SET charges_enabled = $2, payouts_enabled = $3, updated_at = $4
       WHERE id = $1 AND deleted_at IS NULL`,
      [id, chargesEnabled, payoutsEnabled, updatedAt]
    );
  }
}

function mapRow(row: Record<string, unknown>): StripeConnectAccountRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    stripeAccountId: String(row.stripe_account_id),
    chargesEnabled: Boolean(row.charges_enabled),
    payoutsEnabled: Boolean(row.payouts_enabled),
    country: String(row.country),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}
