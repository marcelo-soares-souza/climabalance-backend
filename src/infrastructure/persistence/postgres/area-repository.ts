import { Pool, PoolClient } from 'pg';
import { Area } from '../../../domain/areas/entities/area';
import { AreaRepository, AreaFilters, BoundingBox } from '../../../domain/areas/repositories/area-repository';
import { Location } from '../../../domain/areas/value-objects/location';
import { AreaStatus } from '../../../domain/areas/value-objects/area-status';
import { AuditStatus } from '../../../domain/areas/value-objects/audit-status';
import { Biome } from '../../../domain/areas/value-objects/biome';
import { CarbonCapacity } from '../../../domain/areas/value-objects/carbon-capacity';

export class PostgresAreaRepository implements AreaRepository {
  constructor(private pool: Pool) {}

  async save(area: Area, client?: PoolClient): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `INSERT INTO areas (
        id, owner_user_id, name, description, location,
        biome, country_code, state, city, status, audit_status, audit_notes,
        audited_by_user_id, audited_at, total_capacity_t_co2e,
        committed_t_co2e, t_co2e_per_tree_per_year, price_per_tree,
        default_horizon_years, created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($6, $5), 4326), $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [
        area.id,
        area.ownerUserId,
        area.name,
        area.description || null,
        area.location.latitude,
        area.location.longitude,
        area.biome?.toString() || null,
        area.countryCode || null,
        area.state || null,
        area.city || null,
        area.status.toString(),
        area.auditStatus?.toString() || null,
        area.auditNotes || null,
        area.auditedByUserId || null,
        area.auditedAt || null,
        area.carbonCapacity?.totalCapacityTCO2e || null,
        area.carbonCapacity?.committedTCO2e || 0,
        area.tCO2ePerTreePerYear || null,
        area.pricePerTree || null,
        area.defaultHorizonYears || null,
        area.createdAt,
        area.updatedAt,
        area.deletedAt || null,
      ]
    );
  }

  async findById(id: string, client?: PoolClient): Promise<Area | null> {
    const db = client || this.pool;

    const result = await db.query(
      'SELECT *, ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude FROM areas WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rows.length === 0) return null;

    return this.mapRowToArea(result.rows[0]);
  }

  async findByOwnerId(ownerUserId: string, client?: PoolClient): Promise<Area[]> {
    const db = client || this.pool;

    const result = await db.query(
      'SELECT *, ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude FROM areas WHERE owner_user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC',
      [ownerUserId]
    );

    return result.rows.map((row) => this.mapRowToArea(row));
  }

  async findAll(filters?: AreaFilters, client?: PoolClient): Promise<Area[]> {
    const db = client || this.pool;

    let query = 'SELECT *, ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude FROM areas WHERE deleted_at IS NULL';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status.toString());
    }

    if (filters?.ownerUserId) {
      query += ` AND owner_user_id = $${paramIndex++}`;
      params.push(filters.ownerUserId);
    }

    if (filters?.biome) {
      query += ` AND biome = $${paramIndex++}`;
      params.push(filters.biome.toString());
    }

    if (filters?.onlyActive) {
      query += ` AND status = 'active'`;
    }

    if (filters?.cursor) {
      query += ` AND (updated_at, id) < (
        SELECT updated_at, id FROM areas WHERE id = $${paramIndex++}
      )`;
      params.push(filters.cursor);
    }

    query += ' ORDER BY updated_at DESC, id DESC';

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(filters.offset);
    }

    const result = await db.query(query, params);

    return result.rows.map((row) => this.mapRowToArea(row));
  }

  async findActiveWithCapacity(filters?: { biome?: Biome }, client?: PoolClient): Promise<Area[]> {
    const db = client || this.pool;

    let query = `
      SELECT *, ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude
      FROM areas
      WHERE deleted_at IS NULL
        AND status = 'active'
        AND (
          total_capacity_t_co2e IS NULL
          OR (COALESCE(total_capacity_t_co2e, 0) - COALESCE(committed_t_co2e, 0)) > 0
        )
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.biome) {
      query += ` AND biome = $${paramIndex++}`;
      params.push(filters.biome.toString());
    }

    query += ' ORDER BY updated_at DESC, id DESC';

    const result = await db.query(query, params);

    return result.rows.map((row) => this.mapRowToArea(row));
  }

  async findWithinBounds(bounds: BoundingBox, client?: PoolClient): Promise<Area[]> {
    const db = client || this.pool;

    const result = await db.query(
      `SELECT *, ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude
       FROM areas
       WHERE deleted_at IS NULL
         AND status = 'active'
         AND ST_Within(
           location,
           ST_MakeEnvelope($1, $2, $3, $4, 4326)
         )
ORDER BY updated_at DESC, id DESC`,
       [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
    );

    return result.rows.map((row) => this.mapRowToArea(row));
  }

  async findNearest(
    latitude: number,
    longitude: number,
    limit: number = 10,
    client?: PoolClient
  ): Promise<Area[]> {
    const db = client || this.pool;

    const result = await db.query(
      `SELECT *,
        ST_X(location::geometry) AS longitude,
        ST_Y(location::geometry) AS latitude,
        ST_Distance(location, ST_SetSRID(ST_MakePoint($2, $1), 4326)) / 1000 AS distance_km
       FROM areas
       WHERE deleted_at IS NULL
         AND status = 'active'
         AND ST_DWithin(
           location,
           ST_SetSRID(ST_MakePoint($2, $1), 4326),
           500000
         )
       ORDER BY location <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)
       LIMIT $3`,
      [latitude, longitude, limit]
    );

    return result.rows.map((row) => this.mapRowToArea(row));
  }

  async update(area: Area, client?: PoolClient): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `UPDATE areas SET
        name = $2,
        description = $3,
        location = ST_SetSRID(ST_MakePoint($5, $4), 4326),
        biome = $6,
        country_code = $7,
        state = $8,
        city = $9,
        status = $10,
        audit_status = $11,
        audit_notes = $12,
        audited_by_user_id = $13,
        audited_at = $14,
        total_capacity_t_co2e = $15,
        committed_t_co2e = $16,
        t_co2e_per_tree_per_year = $17,
        price_per_tree = $18,
        default_horizon_years = $19,
        updated_at = $20,
        deleted_at = $21
       WHERE id = $1 AND deleted_at IS NULL`,
      [
        area.id,
        area.name,
        area.description || null,
        area.location.latitude,
        area.location.longitude,
        area.biome?.toString() || null,
        area.countryCode || null,
        area.state || null,
        area.city || null,
        area.status.toString(),
        area.auditStatus?.toString() || null,
        area.auditNotes || null,
        area.auditedByUserId || null,
        area.auditedAt || null,
        area.carbonCapacity?.totalCapacityTCO2e || null,
        area.carbonCapacity?.committedTCO2e || 0,
        area.tCO2ePerTreePerYear || null,
        area.pricePerTree || null,
        area.defaultHorizonYears || null,
        area.updatedAt,
        area.deletedAt || null,
      ]
    );
  }

  async delete(id: string, client?: PoolClient): Promise<void> {
    const db = client || this.pool;

    await db.query(
      'UPDATE areas SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  async exists(id: string, client?: PoolClient): Promise<boolean> {
    const db = client || this.pool;

    const result = await db.query(
      'SELECT 1 FROM areas WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    return result.rows.length > 0;
  }

  async count(filters?: AreaFilters, client?: PoolClient): Promise<number> {
    const db = client || this.pool;

    let query = 'SELECT COUNT(*) FROM areas WHERE deleted_at IS NULL';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status.toString());
    }

    if (filters?.ownerUserId) {
      query += ` AND owner_user_id = $${paramIndex++}`;
      params.push(filters.ownerUserId);
    }

    const result = await db.query(query, params);

    return parseInt(result.rows[0].count, 10);
  }

  async getGlobalStats(): Promise<{ totalAreas: number; totalTreesPlanted: number; totalCO2Captured: number }> {
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM areas WHERE deleted_at IS NULL AND status = 'active') AS total_areas,
        COALESCE(SUM(c.trees_count), 0)::int AS total_trees_planted,
        COALESCE(SUM(c.total_t_co2e), 0) AS total_co2_captured
      FROM compensations c
      WHERE c.deleted_at IS NULL AND c.status = 'paid'
    `);
    return {
      totalAreas: parseInt(result.rows[0].total_areas, 10),
      totalTreesPlanted: parseInt(result.rows[0].total_trees_planted, 10),
      totalCO2Captured: parseFloat(result.rows[0].total_co2_captured),
    };
  }

  private mapRowToArea(row: any): Area {
    const location = new Location(
      parseFloat(row.latitude),
      parseFloat(row.longitude)
    );

    const carbonCapacity =
      row.total_capacity_t_co2e !== null
        ? new CarbonCapacity(
            parseFloat(row.total_capacity_t_co2e),
            parseFloat(row.committed_t_co2e || 0)
          )
        : undefined;

    return new Area({
      id: row.id,
      ownerUserId: row.owner_user_id,
      name: row.name,
      description: row.description,
      location,
      biome: row.biome ? new Biome(row.biome) : undefined,
      countryCode: row.country_code,
      state: row.state,
      city: row.city,
      status: AreaStatus.fromString(row.status),
      auditStatus: row.audit_status ? AuditStatus.fromString(row.audit_status) : undefined,
      auditNotes: row.audit_notes,
      auditedByUserId: row.audited_by_user_id,
      auditedAt: row.audited_at ? new Date(row.audited_at) : undefined,
      carbonCapacity,
      tCO2ePerTreePerYear: row.t_co2e_per_tree_per_year ? parseFloat(row.t_co2e_per_tree_per_year) : undefined,
      pricePerTree: row.price_per_tree ? parseFloat(row.price_per_tree) : undefined,
      defaultHorizonYears: row.default_horizon_years ? parseInt(row.default_horizon_years, 10) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
    });
  }
}
