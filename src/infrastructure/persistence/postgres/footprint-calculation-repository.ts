import type { PoolClient } from 'pg';
import type { FootprintCalculation } from '../../../domain/footprint/entities/footprint-calculation';
import type {
  FootprintCalculationRepository,
  FootprintCalculationWithUser
} from '../../../domain/footprint/repositories/footprint-calculation-repository';
import type { ProfileType } from '../../../domain/footprint/value-objects/profile-type';
import type { CalculationStatus } from '../../../domain/footprint/value-objects/calculation-status';
import type { DbClient } from './db-client';

export class PostgresFootprintCalculationRepository implements FootprintCalculationRepository {
  constructor(private readonly db: DbClient) {}

  async save(calculation: FootprintCalculation, client?: PoolClient): Promise<void> {
    const executor = client || this.db;

    await executor.query(
      `INSERT INTO footprint_calculations (
        id, user_id, profile_type, period_start, period_end,
        total_kg_co2e, total_t_co2e, unit, calculation_method,
        data_quality, factors_version, status, finalized_at,
        created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        calculation.id,
        calculation.user_id,
        calculation.profile_type,
        calculation.period_start,
        calculation.period_end,
        calculation.total_kg_co2e,
        calculation.total_t_co2e,
        calculation.unit,
        calculation.calculation_method,
        calculation.data_quality,
        calculation.factors_version,
        calculation.status,
        calculation.finalized_at,
        calculation.created_at,
        calculation.updated_at,
        calculation.deleted_at
      ]
    );
  }

  async update(calculation: FootprintCalculation, client?: PoolClient): Promise<void> {
    const executor = client || this.db;

    await executor.query(
      `UPDATE footprint_calculations
       SET period_start = $2,
           period_end = $3,
           total_kg_co2e = $4,
           total_t_co2e = $5,
           data_quality = $6,
           status = $7,
           finalized_at = $8,
           updated_at = $9
       WHERE id = $1`,
      [
        calculation.id,
        calculation.period_start,
        calculation.period_end,
        calculation.total_kg_co2e,
        calculation.total_t_co2e,
        calculation.data_quality,
        calculation.status,
        calculation.finalized_at,
        calculation.updated_at
      ]
    );
  }

  async findById(id: string): Promise<FootprintCalculation | null> {
    const result = await this.db.query(
      `SELECT * FROM footprint_calculations WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async findByUserId(
    userId: string,
    filters?: {
      status?: CalculationStatus;
      profile_type?: ProfileType;
      limit?: number;
      offset?: number;
    }
  ): Promise<FootprintCalculationWithUser[]> {
    const conditions: string[] = ['fc.user_id = $1', 'fc.deleted_at IS NULL'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (filters?.status) {
      conditions.push(`fc.status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.profile_type) {
      conditions.push(`fc.profile_type = $${paramIndex}`);
      params.push(filters.profile_type);
      paramIndex++;
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const query = `
      SELECT fc.*, u.email AS user_email, up.display_name AS user_name
      FROM footprint_calculations fc
      JOIN users u ON u.id = fc.user_id AND u.deleted_at IS NULL
      LEFT JOIN user_profiles up ON up.user_id = u.id AND up.deleted_at IS NULL
      WHERE ${conditions.join(' AND ')}
      ORDER BY fc.updated_at DESC, fc.created_at DESC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await this.db.query(query, params);
    return result.rows.map(this.mapRow);
  }

  async findAll(filters?: {
    status?: CalculationStatus;
    profile_type?: ProfileType;
    user_email?: string;
    limit?: number;
    offset?: number;
  }): Promise<FootprintCalculationWithUser[]> {
    const conditions: string[] = ['fc.deleted_at IS NULL', 'u.deleted_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      conditions.push(`fc.status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.profile_type) {
      conditions.push(`fc.profile_type = $${paramIndex}`);
      params.push(filters.profile_type);
      paramIndex++;
    }

    if (filters?.user_email) {
      conditions.push(`LOWER(u.email) LIKE LOWER($${paramIndex})`);
      params.push(`%${filters.user_email}%`);
      paramIndex++;
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const query = `
      SELECT fc.*, u.email AS user_email, up.display_name AS user_name
      FROM footprint_calculations fc
      JOIN users u ON u.id = fc.user_id AND u.deleted_at IS NULL
      LEFT JOIN user_profiles up ON up.user_id = u.id AND up.deleted_at IS NULL
      WHERE ${conditions.join(' AND ')}
      ORDER BY fc.updated_at DESC, fc.created_at DESC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await this.db.query(query, params);
    return result.rows.map(this.mapRow);
  }

  async findByIdWithUser(id: string): Promise<FootprintCalculationWithUser | null> {
    const result = await this.db.query(
      `SELECT fc.*, u.email AS user_email, up.display_name AS user_name
       FROM footprint_calculations fc
       JOIN users u ON u.id = fc.user_id AND u.deleted_at IS NULL
       LEFT JOIN user_profiles up ON up.user_id = u.id AND up.deleted_at IS NULL
       WHERE fc.id = $1 AND fc.deleted_at IS NULL`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async delete(id: string, client?: PoolClient): Promise<void> {
    const executor = client || this.db;

    await executor.query(
      `UPDATE footprint_calculations
       SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
  }

  async sumFinalizedTCO2eByUser(userId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT COALESCE(SUM(total_t_co2e), 0) AS total
       FROM footprint_calculations
       WHERE user_id = $1
         AND status = 'finalized'
         AND deleted_at IS NULL`,
      [userId]
    );

    return Number(result.rows[0]?.total ?? 0);
  }

  private mapRow(row: any): FootprintCalculationWithUser {
    return {
      id: row.id,
      user_id: row.user_id,
      profile_type: row.profile_type,
      period_start: new Date(row.period_start),
      period_end: new Date(row.period_end),
      total_kg_co2e: parseFloat(row.total_kg_co2e),
      total_t_co2e: parseFloat(row.total_t_co2e),
      unit: row.unit,
      calculation_method: row.calculation_method,
      data_quality: row.data_quality,
      factors_version: row.factors_version,
      status: row.status,
      finalized_at: row.finalized_at ? new Date(row.finalized_at) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
      user_email: row.user_email ?? null,
      user_name: row.user_name ?? null
    };
  }
}
