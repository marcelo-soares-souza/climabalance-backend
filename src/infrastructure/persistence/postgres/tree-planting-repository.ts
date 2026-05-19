import type { Pool, PoolClient } from "pg";
import { TreePlanting } from "../../../domain/areas/entities/tree-planting";
import type {
  TreePlantingRepository,
  CreateTreePlantingRecord,
} from "../../../domain/areas/repositories/tree-planting-repository";

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
      `SELECT *, ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude FROM tree_plantings WHERE area_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
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

  async countByAreaIds(areaIds: string[]): Promise<Map<string, number>> {
    if (areaIds.length === 0) return new Map();
    const placeholders = areaIds.map((_, i) => `$${i + 1}`).join(",");
    const result = await this.pool.query(
      `SELECT area_id, COUNT(*)::int AS count FROM tree_plantings WHERE area_id IN (${placeholders}) AND deleted_at IS NULL GROUP BY area_id`,
      areaIds,
    );
    const map = new Map<string, number>();
    for (const areaId of areaIds) {
      map.set(areaId, 0);
    }
    for (const row of result.rows) {
      const r = row as Record<string, unknown>;
      map.set(String(r.area_id), Number(r.count));
    }
    return map;
  }

  async sumCompensatedTreeCountByAreaId(areaId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COALESCE(SUM(trees_count), 0)::int AS total FROM compensations WHERE area_id = $1 AND status = 'paid' AND deleted_at IS NULL`,
      [areaId],
    );
    return Number((result.rows[0] as Record<string, unknown>)?.total ?? 0);
  }

  async sumCompensatedTreeCountByAreaIds(
    areaIds: string[],
  ): Promise<Map<string, number>> {
    if (areaIds.length === 0) return new Map();
    const placeholders = areaIds.map((_, i) => `$${i + 1}`).join(",");
    const result = await this.pool.query(
      `SELECT area_id, COALESCE(SUM(trees_count), 0)::int AS total FROM compensations WHERE area_id IN (${placeholders}) AND status = 'paid' AND deleted_at IS NULL GROUP BY area_id`,
      areaIds,
    );
    const map = new Map<string, number>();
    for (const areaId of areaIds) {
      map.set(areaId, 0);
    }
    for (const row of result.rows) {
      const r = row as Record<string, unknown>;
      map.set(String(r.area_id), Number(r.total));
    }
    return map;
  }

  async saveBatch(records: CreateTreePlantingRecord[]): Promise<void> {
    if (records.length === 0) return;

    const values = records
      .map((_, i) => {
        const base = i * 7;
        return `($${base + 1},$${base + 2},$${base + 3},ST_SetSRID(ST_MakePoint($${base + 5},$${base + 4}), 4326),$${base + 6},$${base + 7})`;
      })
      .join(",");

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
      `INSERT INTO tree_plantings (id, area_id, planted_by_user_id, location, created_at, updated_at) VALUES ${values}`,
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
