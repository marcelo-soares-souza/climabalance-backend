import type { Pool, PoolClient } from 'pg';
import type {
  PaymentCompensationSnapshot,
  PaymentCreateRecord,
  PaymentSimulationStore,
  PaymentSimulationTransaction,
} from '../../../application/payments/simulate-card-payment';

class PostgresPaymentSimulationTransaction
  implements PaymentSimulationTransaction
{
  constructor(private readonly client: PoolClient) {}

  async lockCompensation(
    compensationId: string
  ): Promise<PaymentCompensationSnapshot | null> {
    const result = await this.client.query(
      `SELECT
         id,
         supporter_user_id,
         total_amount,
         currency,
         status
       FROM compensations
       WHERE id = $1
         AND deleted_at IS NULL
       FOR UPDATE`,
      [compensationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      supporterUserId: String(row.supporter_user_id),
      totalAmount: Number(row.total_amount),
      currency: String(row.currency),
      status: String(row.status) as PaymentCompensationSnapshot['status'],
    };
  }

  async insertPayment(record: PaymentCreateRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO payments (
         id,
         compensation_id,
         provider,
         provider_reference,
         amount,
         currency,
         status,
         paid_at,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
       )`,
      [
        record.id,
        record.compensationId,
        record.provider,
        record.providerReference,
        record.amount,
        record.currency,
        record.status,
        record.paidAt ?? null,
        record.createdAt,
        record.updatedAt,
        null,
      ]
    );
  }

  async updateCompensationStatus(
    compensationId: string,
    status: 'paid',
    updatedAt: Date
  ): Promise<void> {
    await this.client.query(
      `UPDATE compensations
       SET status = $2,
           updated_at = $3
       WHERE id = $1`,
      [compensationId, status, updatedAt]
    );
  }
}

export class PostgresPaymentSimulationStore implements PaymentSimulationStore {
  constructor(private readonly pool: Pool) {}

  async runInTransaction<T>(
    work: (tx: PaymentSimulationTransaction) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new PostgresPaymentSimulationTransaction(client);
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
