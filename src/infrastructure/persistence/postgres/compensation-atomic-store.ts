import type { Pool, PoolClient } from 'pg';
import type {
  CompensationAtomicStore,
  CompensationAtomicTransaction,
  CompensationAreaSnapshot,
  CompensationCreateRecord
} from '../../../application/compensations/create-compensation-atomic';

class PostgresCompensationAtomicTransaction
  implements CompensationAtomicTransaction
{
  constructor(private readonly client: PoolClient) {}

  async lockArea(areaId: string): Promise<CompensationAreaSnapshot | null> {
    const result = await this.client.query(
      `SELECT
        id,
        status,
        COALESCE(total_capacity_t_co2e, 0) AS total_capacity_t_co2e,
        COALESCE(committed_t_co2e, 0) AS committed_t_co2e
      FROM areas
      WHERE id = $1
        AND deleted_at IS NULL
      FOR UPDATE`,
      [areaId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      status: String(row.status),
      totalCapacityTCO2e: Number(row.total_capacity_t_co2e),
      committedTCO2e: Number(row.committed_t_co2e),
    };
  }

  async updateAreaCommitted(
    areaId: string,
    committedTCO2e: number,
    updatedAt: Date
  ): Promise<void> {
    await this.client.query(
      `UPDATE areas
       SET committed_t_co2e = $2,
           updated_at = $3
       WHERE id = $1`,
      [areaId, committedTCO2e, updatedAt]
    );
  }

  async insertCompensation(record: CompensationCreateRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO compensations (
        id,
        supporter_user_id,
        area_id,
        calculation_id,
        total_co2_kg,
        total_t_co2e,
        trees_count,
        total_amount,
        currency,
        status,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
      )`,
      [
        record.id,
        record.supporterUserId,
        record.areaId,
        record.calculationId ?? null,
        record.totalCO2Kg,
        record.totalTCO2e,
        record.treesCount,
        record.totalAmount,
        record.currency,
        record.status,
        record.createdAt,
        record.updatedAt,
        null,
      ]
    );
  }
}

export class PostgresCompensationAtomicStore implements CompensationAtomicStore {
  constructor(private readonly pool: Pool) {}

  async runInTransaction<T>(
    work: (tx: CompensationAtomicTransaction) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new PostgresCompensationAtomicTransaction(client);
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
