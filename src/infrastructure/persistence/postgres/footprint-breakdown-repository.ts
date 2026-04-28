import type { PoolClient } from 'pg';
import type { FootprintBreakdown } from '../../../domain/footprint/entities/footprint-breakdown';
import type { FootprintBreakdownRepository } from '../../../domain/footprint/repositories/footprint-breakdown-repository';
import type { DbClient } from './db-client';

export class PostgresFootprintBreakdownRepository implements FootprintBreakdownRepository {
  constructor(private readonly db: DbClient) {}

  async save(breakdown: FootprintBreakdown, client?: PoolClient): Promise<void> {
    const executor = client || this.db;

    await executor.query(
      `INSERT INTO footprint_result_breakdown (
        id, calculation_id, category, kg_co2e, t_co2e,
        created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        breakdown.id,
        breakdown.calculation_id,
        breakdown.category,
        breakdown.kg_co2e,
        breakdown.t_co2e,
        breakdown.created_at,
        breakdown.updated_at,
        breakdown.deleted_at
      ]
    );
  }

  async saveMany(breakdowns: FootprintBreakdown[], client?: PoolClient): Promise<void> {
    const executor = client || this.db;

    if (breakdowns.length === 0) return;

    const values: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const breakdown of breakdowns) {
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`
      );
      params.push(
        breakdown.id,
        breakdown.calculation_id,
        breakdown.category,
        breakdown.kg_co2e,
        breakdown.t_co2e,
        breakdown.created_at,
        breakdown.updated_at,
        breakdown.deleted_at
      );
      paramIndex += 8;
    }

    await executor.query(
      `INSERT INTO footprint_result_breakdown (
        id, calculation_id, category, kg_co2e, t_co2e,
        created_at, updated_at, deleted_at
      ) VALUES ${values.join(', ')}`,
      params
    );
  }

  async findByCalculationId(calculationId: string): Promise<FootprintBreakdown[]> {
    const result = await this.db.query(
      `SELECT * FROM footprint_result_breakdown WHERE calculation_id = $1 AND deleted_at IS NULL ORDER BY category`,
      [calculationId]
    );

    return result.rows.map(this.mapRow);
  }

  async deleteByCalculationId(calculationId: string, client?: PoolClient): Promise<void> {
    const executor = client || this.db;

    await executor.query(
      `UPDATE footprint_result_breakdown
       SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE calculation_id = $1`,
      [calculationId]
    );
  }

  private mapRow(row: any): FootprintBreakdown {
    return {
      id: row.id,
      calculation_id: row.calculation_id,
      category: row.category,
      kg_co2e: parseFloat(row.kg_co2e),
      t_co2e: parseFloat(row.t_co2e),
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at
    };
  }
}
