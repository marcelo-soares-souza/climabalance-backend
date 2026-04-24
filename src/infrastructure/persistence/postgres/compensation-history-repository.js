function mapRow(row) {
    return {
        id: String(row.id),
        supporterUserId: String(row.supporter_user_id),
        areaId: String(row.area_id),
        areaName: row.area_name == null ? null : String(row.area_name),
        calculationId: row.calculation_id == null ? null : String(row.calculation_id),
        compensationMode: row.compensation_mode == null
            ? 'tco2e'
            : String(row.compensation_mode),
        horizonYears: row.horizon_years == null ? null : Number(row.horizon_years),
        treesRequested: row.trees_requested == null ? null : Number(row.trees_requested),
        pricePerTree: row.price_per_tree == null ? null : Number(row.price_per_tree),
        estimatedTotalTCO2e: row.estimated_total_t_co2e == null
            ? null
            : Number(row.estimated_total_t_co2e),
        totalTCO2e: Number(row.total_t_co2e),
        treesCount: row.trees_count == null ? null : Number(row.trees_count),
        totalAmount: Number(row.total_amount),
        currency: String(row.currency),
        status: String(row.status),
        createdAt: new Date(String(row.created_at)),
    };
}
function mapAreaContributionRow(row) {
    return {
        compensationId: String(row.compensation_id),
        supporterUserId: String(row.supporter_user_id),
        supporterDisplayName: row.supporter_display_name == null
            ? null
            : String(row.supporter_display_name),
        supporterEmail: row.supporter_email == null
            ? null
            : String(row.supporter_email),
        treesCount: Number(row.trees_count ?? 0),
        totalTCO2e: Number(row.total_t_co2e ?? 0),
        compensatedAt: new Date(String(row.compensated_at)),
    };
}
export class PostgresCompensationHistoryRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async listBySupporter(input) {
        const params = [input.supporterUserId];
        const where = ['c.supporter_user_id = $1', 'c.deleted_at IS NULL'];
        if (input.status) {
            params.push(input.status);
            where.push(`c.status = $${params.length}`);
        }
        params.push(input.limit);
        const limitParam = params.length;
        params.push(input.offset);
        const offsetParam = params.length;
        const result = await this.pool.query(`SELECT
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
      OFFSET $${offsetParam}`, params);
        return result.rows.map((row) => mapRow(row));
    }
    async listPaidTreePurchaseByArea(input) {
        const result = await this.pool.query(`SELECT
        c.id AS compensation_id,
        c.supporter_user_id,
        up.display_name AS supporter_display_name,
        u.email AS supporter_email,
        COALESCE(c.trees_count, c.trees_requested) AS trees_count,
        COALESCE(c.total_t_co2e, (c.total_co2_kg / 1000.0), c.estimated_total_t_co2e) AS total_t_co2e,
        c.updated_at AS compensated_at
      FROM compensations c
      LEFT JOIN user_profiles up
        ON up.user_id = c.supporter_user_id
       AND up.deleted_at IS NULL
      LEFT JOIN users u
        ON u.id = c.supporter_user_id
       AND u.deleted_at IS NULL
      WHERE c.area_id = $1
        AND c.compensation_mode = 'tree_purchase'
        AND c.status = 'paid'
        AND c.deleted_at IS NULL
      ORDER BY c.updated_at DESC
      LIMIT $2
      OFFSET $3`, [input.areaId, input.limit, input.offset]);
        return result.rows.map((row) => mapAreaContributionRow(row));
    }
}
