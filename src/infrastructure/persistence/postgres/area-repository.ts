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
        id, owner_user_id, name, description, latitude, longitude,
        biome, state, city, status, audit_status, audit_notes,
        audited_by_user_id, audited_at, total_capacity_t_co2e,
        committed_t_co2e, t_co2e_per_tree_per_year,
        created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        area.id,
        area.ownerUserId,
        area.name,
        area.description || null,
        area.location.latitude,
        area.location.longitude,
        area.biome?.toString() || null,
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
        area.createdAt,
        area.updatedAt,
        area.deletedAt || null,
      ]
    );
  }

  async findById(id: string, client?: PoolClient): Promise<Area | null> {
    const db = client || this.pool;

    const result = await db.query(
      'SELECT * FROM areas WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rows.length === 0) return null;

    return this.mapRowToArea(result.rows[0]);
  }

  async findByOwnerId(ownerUserId: string, client?: PoolClient): Promise<Area[]> {
    const db = client || this.pool;

    const result = await db.query(
      'SELECT * FROM areas WHERE owner_user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [ownerUserId]
    );

    return result.rows.map((row) => this.mapRowToArea(row));
  }

  async findAll(filters?: AreaFilters, client?: PoolClient): Promise<Area[]> {
    const db = client || this.pool;

    let query = 'SELECT * FROM areas WHERE deleted_at IS NULL';
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

    query += ' ORDER BY created_at DESC';

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
      SELECT * FROM areas
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

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);

    return result.rows.map((row) => this.mapRowToArea(row));
  }

  async findWithinBounds(bounds: BoundingBox, client?: PoolClient): Promise<Area[]> {
    const db = client || this.pool;

    const result = await db.query(
      `SELECT * FROM areas
       WHERE deleted_at IS NULL
         AND latitude BETWEEN $1 AND $2
         AND longitude BETWEEN $3 AND $4
         AND status = 'active'
       ORDER BY created_at DESC`,
      [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng]
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
        (6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )) AS distance_km
       FROM areas
       WHERE deleted_at IS NULL AND status = 'active'
       ORDER BY distance_km
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
        latitude = $4,
        longitude = $5,
        biome = $6,
        state = $7,
        city = $8,
        status = $9,
        audit_status = $10,
        audit_notes = $11,
        audited_by_user_id = $12,
        audited_at = $13,
        total_capacity_t_co2e = $14,
        committed_t_co2e = $15,
        t_co2e_per_tree_per_year = $16,
        updated_at = $17,
        deleted_at = $18
       WHERE id = $1`,
      [
        area.id,
        area.name,
        area.description || null,
        area.location.latitude,
        area.location.longitude,
        area.biome?.toString() || null,
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
      biome: row.biome ? Biome.fromString(row.biome) : undefined,
      state: row.state,
      city: row.city,
      status: AreaStatus.fromString(row.status),
      auditStatus: row.audit_status ? AuditStatus.fromString(row.audit_status) : undefined,
      auditNotes: row.audit_notes,
      auditedByUserId: row.audited_by_user_id,
      auditedAt: row.audited_at ? new Date(row.audited_at) : undefined,
      carbonCapacity,
      tCO2ePerTreePerYear: row.t_co2e_per_tree_per_year ? parseFloat(row.t_co2e_per_tree_per_year) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
    });
  }
}
