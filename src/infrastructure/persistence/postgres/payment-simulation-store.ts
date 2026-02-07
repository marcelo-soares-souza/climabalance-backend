import type { Pool, PoolClient } from 'pg';
import type {
  CompensationCertificateSnapshot,
  LockedPaymentRecord,
  PaymentCompensationSnapshot,
  PaymentCreateRecord,
  PaymentStatus,
  PaymentStore,
  PaymentTransaction,
  PendingPaymentRecord,
} from '../../../application/payments/payment-store';

/**
 * Transaction-scoped PostgreSQL implementation for payment store operations.
 */
class PostgresPaymentTransaction implements PaymentTransaction {
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

  async lockPaymentById(paymentId: string): Promise<LockedPaymentRecord | null> {
    const result = await this.client.query(
      `SELECT
         p.id,
         p.compensation_id,
         p.provider,
         p.provider_reference,
         p.amount,
         p.currency,
         p.status AS payment_status,
         p.paid_at,
         c.supporter_user_id,
         c.status AS compensation_status
       FROM payments p
       INNER JOIN compensations c ON c.id = p.compensation_id
       WHERE p.id = $1
         AND p.deleted_at IS NULL
         AND c.deleted_at IS NULL
       FOR UPDATE OF p, c`,
      [paymentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapLockedPayment(result.rows[0] as Record<string, unknown>);
  }

  async lockPaymentByProviderReference(input: {
    provider: string;
    providerReference: string;
  }): Promise<LockedPaymentRecord | null> {
    const result = await this.client.query(
      `SELECT
         p.id,
         p.compensation_id,
         p.provider,
         p.provider_reference,
         p.amount,
         p.currency,
         p.status AS payment_status,
         p.paid_at,
         c.supporter_user_id,
         c.status AS compensation_status
       FROM payments p
       INNER JOIN compensations c ON c.id = p.compensation_id
       WHERE p.provider = $1
         AND p.provider_reference = $2
         AND p.deleted_at IS NULL
         AND c.deleted_at IS NULL
       ORDER BY p.created_at DESC
       LIMIT 1
       FOR UPDATE OF p, c`,
      [input.provider, input.providerReference]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapLockedPayment(result.rows[0] as Record<string, unknown>);
  }

  async updatePaymentStatus(input: {
    paymentId: string;
    status: PaymentStatus;
    updatedAt: Date;
    paidAt?: Date;
  }): Promise<void> {
    await this.client.query(
      `UPDATE payments
       SET status = $2,
           paid_at = $3,
           updated_at = $4
       WHERE id = $1`,
      [input.paymentId, input.status, input.paidAt ?? null, input.updatedAt]
    );
  }

  async updateCompensationStatus(input: {
    compensationId: string;
    status: 'pending' | 'paid' | 'canceled';
    updatedAt: Date;
  }): Promise<void> {
    await this.client.query(
      `UPDATE compensations
       SET status = $2,
           updated_at = $3
       WHERE id = $1`,
      [input.compensationId, input.status, input.updatedAt]
    );
  }

  async releaseAreaCommitmentForCompensation(input: {
    compensationId: string;
    updatedAt: Date;
  }): Promise<void> {
    await this.client.query(
      `UPDATE areas AS a
       SET committed_t_co2e = GREATEST(
             0,
             COALESCE(a.committed_t_co2e, 0) -
             COALESCE(c.total_t_co2e, (c.total_co2_kg / 1000.0), 0)
           ),
           updated_at = $2
       FROM compensations AS c
       WHERE c.id = $1
         AND c.area_id = a.id`,
      [input.compensationId, input.updatedAt]
    );
  }

  private mapLockedPayment(row: Record<string, unknown>): LockedPaymentRecord {
    const paidAt = row.paid_at;
    return {
      id: String(row.id),
      compensationId: String(row.compensation_id),
      supporterUserId: String(row.supporter_user_id),
      provider: String(row.provider),
      providerReference: String(row.provider_reference),
      amount: Number(row.amount),
      currency: String(row.currency),
      paymentStatus: String(row.payment_status) as LockedPaymentRecord['paymentStatus'],
      compensationStatus: String(
        row.compensation_status
      ) as LockedPaymentRecord['compensationStatus'],
      paidAt: paidAt ? new Date(String(paidAt)) : undefined,
    };
  }
}

/**
 * PostgreSQL adapter for the payment store port.
 */
export class PostgresPaymentStore implements PaymentStore {
  constructor(private readonly pool: Pool) {}

  async runInTransaction<T>(
    work: (tx: PaymentTransaction) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new PostgresPaymentTransaction(client);
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

  async listPendingPayments(limit: number): Promise<PendingPaymentRecord[]> {
    const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100;

    const result = await this.pool.query(
      `SELECT
         p.id,
         p.compensation_id,
         p.provider,
         p.provider_reference,
         p.amount,
         p.currency,
         p.status AS payment_status,
         c.status AS compensation_status,
         c.supporter_user_id
       FROM payments p
       INNER JOIN compensations c ON c.id = p.compensation_id
       WHERE p.status = 'pending'
         AND p.deleted_at IS NULL
         AND c.deleted_at IS NULL
       ORDER BY p.created_at ASC
       LIMIT $1`,
      [effectiveLimit]
    );

    return result.rows.map((row) => {
      const data = row as Record<string, unknown>;
      return {
        id: String(data.id),
        compensationId: String(data.compensation_id),
        supporterUserId: String(data.supporter_user_id),
        provider: String(data.provider),
        providerReference: String(data.provider_reference),
        amount: Number(data.amount),
        currency: String(data.currency),
        paymentStatus: 'pending' as const,
        compensationStatus: String(
          data.compensation_status
        ) as PendingPaymentRecord['compensationStatus'],
      };
    });
  }

  async getCompensationForCertificate(
    compensationId: string
  ): Promise<CompensationCertificateSnapshot | null> {
    const result = await this.pool.query(
      `SELECT
         id,
         supporter_user_id,
         area_id,
         calculation_id,
         compensation_mode,
         horizon_years,
         trees_requested,
         price_per_tree,
         estimated_total_t_co2e,
         COALESCE(total_t_co2e, (total_co2_kg / 1000.0)) AS total_t_co2e,
         trees_count,
         total_amount,
         currency,
         status
       FROM compensations
       WHERE id = $1
         AND deleted_at IS NULL
       LIMIT 1`,
      [compensationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      supporterUserId: String(row.supporter_user_id),
      areaId: String(row.area_id),
      calculationId: row.calculation_id == null ? null : String(row.calculation_id),
      compensationMode:
        row.compensation_mode == null
          ? null
          : (String(row.compensation_mode) as CompensationCertificateSnapshot['compensationMode']),
      horizonYears: row.horizon_years == null ? null : Number(row.horizon_years),
      treesRequested:
        row.trees_requested == null ? null : Number(row.trees_requested),
      pricePerTree: row.price_per_tree == null ? null : Number(row.price_per_tree),
      estimatedTotalTCO2e:
        row.estimated_total_t_co2e == null
          ? null
          : Number(row.estimated_total_t_co2e),
      totalTCO2e: Number(row.total_t_co2e),
      treesCount: Number(row.trees_count ?? 0),
      totalAmount: Number(row.total_amount),
      currency: String(row.currency),
      status: String(row.status) as CompensationCertificateSnapshot['status'],
    };
  }
}

/**
 * Backward-compatible export alias used in previous tasks.
 */
export const PostgresPaymentSimulationStore = PostgresPaymentStore;
