import type { PoolClient } from "pg";
import type { CompensationProjection } from "../../../domain/footprint/entities/compensation-projection";
import type { CompensationProjectionRepository } from "../../../domain/footprint/repositories/compensation-projection-repository";
import type { DbClient } from "./db-client";

export class PostgresCompensationProjectionRepository implements CompensationProjectionRepository {
  constructor(private readonly db: DbClient) {}

  async save(
    projection: CompensationProjection,
    client?: PoolClient,
  ): Promise<void> {
    const executor = client || this.db;

    await executor.query(
      `INSERT INTO compensation_projection (
        id, calculation_id, area_id, biome, t_co2e_per_tree_per_year,
        trees_needed, horizon_years, created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        projection.id,
        projection.calculation_id,
        projection.area_id,
        projection.biome,
        projection.t_co2e_per_tree_per_year,
        projection.trees_needed,
        projection.horizon_years,
        projection.created_at,
        projection.updated_at,
        projection.deleted_at,
      ],
    );
  }

  async findByCalculationId(
    calculationId: string,
  ): Promise<CompensationProjection | null> {
    const result = await this.db.query(
      `SELECT * FROM compensation_projection WHERE calculation_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [calculationId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async findByAreaId(areaId: string): Promise<CompensationProjection[]> {
    const result = await this.db.query(
      `SELECT * FROM compensation_projection WHERE area_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [areaId],
    );

    return result.rows.map(this.mapRow);
  }

  private mapRow(row: any): CompensationProjection {
    return {
      id: row.id,
      calculation_id: row.calculation_id,
      area_id: row.area_id,
      biome: row.biome,
      t_co2e_per_tree_per_year: parseFloat(row.t_co2e_per_tree_per_year),
      trees_needed: parseFloat(row.trees_needed),
      horizon_years: parseFloat(row.horizon_years),
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    };
  }
}
