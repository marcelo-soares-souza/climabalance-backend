import type { Pool } from 'pg';
import type { AreaRepository } from '../../../application/footprint/create-compensation-projection';
import { pgPool } from './pg-client';

/**
 * Partial implementation of Area Repository
 * Only implements methods needed for footprint calculator
 */
export class PostgresAreaRepository implements AreaRepository {
  constructor(private pool: Pool = pgPool) {}

  async findById(id: string): Promise<{
    id: string;
    biome: string | null;
    t_co2e_per_tree_per_year?: number;
  } | null> {
    const result = await this.pool.query(
      `SELECT id, biome FROM areas WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      biome: row.biome,
      // t_co2e_per_tree_per_year can be added to areas table later
      // For now, will use default value in use case
    };
  }
}
