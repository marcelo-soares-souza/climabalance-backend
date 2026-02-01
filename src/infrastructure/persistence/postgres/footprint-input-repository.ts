import type { Pool, PoolClient } from 'pg';
import type { FootprintInput } from '../../../domain/footprint/entities/footprint-input';
import type { FootprintInputRepository } from '../../../domain/footprint/repositories/footprint-input-repository';
import { pgPool } from './pg-client';

export class PostgresFootprintInputRepository implements FootprintInputRepository {
  constructor(private pool: Pool = pgPool) {}

  async save(input: FootprintInput, client?: PoolClient): Promise<void> {
    const executor = client || this.pool;

    await executor.query(
      `INSERT INTO footprint_input (
        id, calculation_id, activity_type, category, quantity, unit,
        kg_co2e, metadata_json, created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.id,
        input.calculation_id,
        input.activity_type,
        input.category,
        input.quantity,
        input.unit,
        input.kg_co2e,
        input.metadata_json,
        input.created_at,
        input.updated_at,
        input.deleted_at
      ]
    );
  }

  async saveMany(inputs: FootprintInput[], client?: PoolClient): Promise<void> {
    const executor = client || this.pool;

    if (inputs.length === 0) return;

    const values: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const input of inputs) {
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10})`
      );
      params.push(
        input.id,
        input.calculation_id,
        input.activity_type,
        input.category,
        input.quantity,
        input.unit,
        input.kg_co2e,
        input.metadata_json,
        input.created_at,
        input.updated_at,
        input.deleted_at
      );
      paramIndex += 11;
    }

    await executor.query(
      `INSERT INTO footprint_input (
        id, calculation_id, activity_type, category, quantity, unit,
        kg_co2e, metadata_json, created_at, updated_at, deleted_at
      ) VALUES ${values.join(', ')}`,
      params
    );
  }

  async findByCalculationId(calculationId: string): Promise<FootprintInput[]> {
    const result = await this.pool.query(
      `SELECT * FROM footprint_input WHERE calculation_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
      [calculationId]
    );

    return result.rows.map(this.mapRow);
  }

  async deleteByCalculationId(calculationId: string, client?: PoolClient): Promise<void> {
    const executor = client || this.pool;

    await executor.query(
      `UPDATE footprint_input
       SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE calculation_id = $1`,
      [calculationId]
    );
  }

  private mapRow(row: any): FootprintInput {
    return {
      id: row.id,
      calculation_id: row.calculation_id,
      activity_type: row.activity_type,
      category: row.category,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      kg_co2e: parseFloat(row.kg_co2e),
      metadata_json: row.metadata_json,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at
    };
  }
}
