import type { Pool, PoolClient } from 'pg';
import type {
  CompensationHistoryItem,
  CompensationHistoryRepository,
} from '../../../domain/compensations/repositories/compensation-history-repository';

function mapRow(row: Record<string, unknown>): CompensationHistoryItem {
  return {
    id: String(row.id),
    supporterUserId: String(row.supporter_user_id),
    areaId: String(row.area_id),
    areaName: row.area_name == null ? null : String(row.area_name),
    calculationId: row.calculation_id == null ? null : String(row.calculation_id),
    compensationMode:
      row.compensation_mode == null
        ? 'tco2e'
        : (String(row.compensation_mode) as CompensationHistoryItem['compensationMode']),
    horizonYears: row.horizon_years == null ? null : Number(row.horizon_years),
    treesRequested:
      row.trees_requested == null ? null : Number(row.trees_requested),
    pricePerTree: row.price_per_tree == null ? null : Number(row.price_per_tree),
    estimatedTotalTCO2e:
      row.estimated_total_t_co2e == null
        ? null
        : Number(row.estimated_total_t_co2e),
    totalTCO2e: Number(row.total_t_co2e),
    treesCount: row.trees_count == null ? null : Number(row.trees_count),
    totalAmount: Number(row.total_amount),
    currency: String(row.currency),
    status: String(row.status) as CompensationHistoryItem['status'],
    createdAt: new Date(String(row.created_at)),
  };
}

export class PostgresCompensationHistoryRepository
  implements CompensationHistoryRepository
{
  constructor(private readonly pool: Pool | PoolClient) {}

  async listBySupporter(input: {
    supporterUserId: string;
    status?: CompensationHistoryItem['status'];
    limit: number;
    offset: number;
  }): Promise<CompensationHistoryItem[]> {
    const params: Array<string | number> = [input.supporterUserId];
    const where: string[] = ['c.supporter_user_id = $1', 'c.deleted_at IS NULL'];

    if (input.status) {
      params.push(input.status);
      where.push(`c.status = $${params.length}`);
    }

    params.push(input.limit);
    const limitParam = params.length;
    params.push(input.offset);
    const offsetParam = params.length;

    const result = await this.pool.query(
      `SELECT
        c.id,
        c.supporter_user_id,
        c.area_id,
        a.name AS area_name,
        c.calculation_id,
        c.compensation_mode,
        c.horizon_years,
        c.trees_requested,
        c.price_per_tree,
        c.estimated_total_t_co2e,
        COALESCE(c.total_t_co2e, (c.total_co2_kg / 1000.0)) AS total_t_co2e,
        c.trees_count,
        c.total_amount,
        c.currency,
        c.status,
        c.created_at
      FROM compensations c
      LEFT JOIN areas a ON a.id = c.area_id
      WHERE ${where.join(' AND ')}
      ORDER BY c.created_at DESC
      LIMIT $${limitParam}
      OFFSET $${offsetParam}`,
      params
    );

    return result.rows.map((row) => mapRow(row as Record<string, unknown>));
  }
}
