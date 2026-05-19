import { Pool, PoolClient } from "pg";
import { AreaCriterion } from "../../../domain/areas/entities/area-criterion";
import { AreaCriteriaRepository } from "../../../domain/areas/repositories/area-criteria-repository";

export class PostgresAreaCriteriaRepository implements AreaCriteriaRepository {
  constructor(private pool: Pool) {}

  async save(criterion: AreaCriterion, client?: PoolClient): Promise<void> {
    const db = client || this.pool;

    await db.query(
      `INSERT INTO area_criteria (
        id, area_id, criterion_key, criterion_label, met, notes,
        created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        met = EXCLUDED.met,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at`,
      [
        criterion.id,
        criterion.areaId,
        criterion.criterionKey,
        criterion.criterionLabel,
        criterion.met,
        criterion.notes || null,
        criterion.createdAt,
        criterion.updatedAt,
        criterion.deletedAt || null,
      ],
    );
  }

  async saveMany(
    criteria: AreaCriterion[],
    client?: PoolClient,
  ): Promise<void> {
    if (criteria.length === 0) return;

    const db = client || this.pool;

    // Build batch insert query
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const criterion of criteria) {
      const placeholder = `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`;
      placeholders.push(placeholder);

      values.push(
        criterion.id,
        criterion.areaId,
        criterion.criterionKey,
        criterion.criterionLabel,
        criterion.met,
        criterion.notes || null,
        criterion.createdAt,
        criterion.updatedAt,
        criterion.deletedAt || null,
      );
    }

    await db.query(
      `INSERT INTO area_criteria (
        id, area_id, criterion_key, criterion_label, met, notes,
        created_at, updated_at, deleted_at
      ) VALUES ${placeholders.join(", ")}
      ON CONFLICT (id) DO UPDATE SET
        met = EXCLUDED.met,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at`,
      values,
    );
  }

  async findByAreaId(
    areaId: string,
    client?: PoolClient,
  ): Promise<AreaCriterion[]> {
    const db = client || this.pool;

    const result = await db.query(
      `SELECT * FROM area_criteria
       WHERE area_id = $1 AND deleted_at IS NULL
       ORDER BY criterion_key`,
      [areaId],
    );

    return result.rows.map((row) => this.mapRowToCriterion(row));
  }

  async deleteByAreaId(areaId: string, client?: PoolClient): Promise<void> {
    const db = client || this.pool;

    await db.query(
      "UPDATE area_criteria SET deleted_at = CURRENT_TIMESTAMP WHERE area_id = $1",
      [areaId],
    );
  }

  async countByAreaId(areaId: string, client?: PoolClient): Promise<number> {
    const db = client || this.pool;

    const result = await db.query(
      "SELECT COUNT(*) FROM area_criteria WHERE area_id = $1 AND deleted_at IS NULL",
      [areaId],
    );

    return parseInt(result.rows[0].count, 10);
  }

  async areAllMetForArea(
    areaId: string,
    client?: PoolClient,
  ): Promise<boolean> {
    const db = client || this.pool;

    const result = await db.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN met = true THEN 1 ELSE 0 END) as met_count
       FROM area_criteria
       WHERE area_id = $1 AND deleted_at IS NULL`,
      [areaId],
    );

    const row = result.rows[0];
    const total = parseInt(row.total, 10);
    const metCount = parseInt(row.met_count || 0, 10);

    // If there are no criteria, return false (criteria must exist to be met)
    if (total === 0) return false;

    // All criteria must be met
    return total === metCount;
  }

  private mapRowToCriterion(row: any): AreaCriterion {
    return new AreaCriterion({
      id: row.id,
      areaId: row.area_id,
      criterionKey: row.criterion_key,
      criterionLabel: row.criterion_label,
      met: row.met,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
    });
  }
}
