import type { Pool, PoolClient } from 'pg';
import { TreePlanting } from '../../../domain/areas/entities/tree-planting';
import type {
  TreePlantingRepository,
  CreateTreePlantingRecord,
} from '../../../domain/areas/repositories/tree-planting-repository';

function mapRow(row: Record<string, unknown>): TreePlanting {
  return new TreePlanting(
    String(row.id),
    String(row.area_id),
    String(row.planted_by_user_id),
    Number(row.latitude),
    Number(row.longitude),
    new Date(String(row.created_at)),
    new Date(String(row.updated_at)),
    row.deleted_at ? new Date(String(row.deleted_at)) : null,
  );
}

export class PostgresTreePlantingRepository implements TreePlantingRepository {
  constructor(private readonly pool: Pool | PoolClient) {}

  async findByAreaId(areaId: string): Promise<TreePlanting[]> {
    const result = await this.pool.query(
      `SELECT * FROM tree_plantings WHERE area_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
      [areaId],
    );
    return result.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async countByAreaId(areaId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM tree_plantings WHERE area_id = $1 AND deleted_at IS NULL`,
      [areaId],
    );
    return Number((result.rows[0] as Record<string, unknown>)?.count ?? 0);
  }

  async sumCompensatedTreeCountByAreaId(areaId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COALESCE(SUM(trees_count), 0)::int AS total FROM compensations WHERE area_id = $1 AND status = 'paid' AND deleted_at IS NULL`,
      [areaId],
    );
    return Number((result.rows[0] as Record<string, unknown>)?.total ?? 0);
  }

  async saveBatch(records: CreateTreePlantingRecord[]): Promise<void> {
    if (records.length === 0) return;

    const values = records
      .map((_, i) => {
        const base = i * 7;
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`;
      })
      .join(',');

    const params = records.flatMap((r) => [
      r.id,
      r.areaId,
      r.plantedByUserId,
      r.latitude,
      r.longitude,
      r.createdAt,
      r.updatedAt,
    ]);

    await this.pool.query(
      `INSERT INTO tree_plantings (id, area_id, planted_by_user_id, latitude, longitude, created_at, updated_at) VALUES ${values}`,
      params,
    );
  }

  async deleteByAreaId(areaId: string): Promise<void> {
    await this.pool.query(
      `UPDATE tree_plantings SET deleted_at = NOW(), updated_at = NOW() WHERE area_id = $1 AND deleted_at IS NULL`,
      [areaId],
    );
  }
}
