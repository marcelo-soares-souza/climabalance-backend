import type { Pool, PoolClient } from "pg";
import type {
  CompensationAtomicStore,
  CompensationAtomicTransaction,
  CompensationAreaSnapshot,
  CompensationCreateRecord,
} from "../../../application/compensations/create-compensation-atomic";

class PostgresCompensationAtomicTransaction implements CompensationAtomicTransaction {
  constructor(private readonly client: PoolClient) {}

  async lockArea(areaId: string): Promise<CompensationAreaSnapshot | null> {
    const result = await this.client.query(
      `SELECT
        id,
        status,
        max_purchasable_trees
      FROM areas
      WHERE id = $1
        AND deleted_at IS NULL
      FOR UPDATE`,
      [areaId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      status: String(row.status),
      maxPurchasableTrees:
        row.max_purchasable_trees != null
          ? Number(row.max_purchasable_trees)
          : null,
    };
  }

  async sumPaidTreeCountByArea(areaId: string): Promise<number> {
    const result = await this.client.query(
      `SELECT COALESCE(SUM(trees_count), 0) AS total
       FROM compensations
       WHERE area_id = $1
         AND status = 'paid'
         AND deleted_at IS NULL`,
      [areaId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async insertCompensation(record: CompensationCreateRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO compensations (
        id,
        supporter_user_id,
        area_id,
        calculation_id,
        compensation_mode,
        horizon_years,
        trees_requested,
        price_per_tree,
        estimated_total_t_co2e,
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
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )`,
      [
        record.id,
        record.supporterUserId,
        record.areaId,
        record.calculationId ?? null,
        record.compensationMode,
        record.horizonYears ?? null,
        record.treesRequested ?? null,
        record.pricePerTree ?? null,
        record.estimatedTotalTCO2e ?? null,
        record.totalCO2Kg,
        record.totalTCO2e,
        record.treesCount,
        record.totalAmount,
        record.currency,
        record.status,
        record.createdAt,
        record.updatedAt,
        null,
      ],
    );
  }
}

export class PostgresCompensationAtomicStore implements CompensationAtomicStore {
  constructor(private readonly pool: Pool) {}

  async runInTransaction<T>(
    work: (tx: CompensationAtomicTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const tx = new PostgresCompensationAtomicTransaction(client);
      const result = await work(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
