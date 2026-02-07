import { pgPool } from './pg-client';
export class PostgresEmissionFactorRepository {
    pool;
    constructor(pool = pgPool) {
        this.pool = pool;
    }
    async findByVersionAndRegion(version, region) {
        const result = await this.pool.query(`SELECT *
       FROM emission_factors
       WHERE version = $1
         AND region = $2
         AND deleted_at IS NULL
         AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
         AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
       ORDER BY activity_type, unit`, [version, region]);
        return result.rows.map(this.mapRow);
    }
    async findByCategory(category, version, region) {
        // Map category to activity_type pattern
        const activityPattern = this.getCategoryPattern(category);
        const result = await this.pool.query(`SELECT *
       FROM emission_factors
       WHERE activity_type LIKE $1
         AND version = $2
         AND region = $3
         AND deleted_at IS NULL
         AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
         AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
       ORDER BY activity_type, unit`, [activityPattern, version, region]);
        return result.rows.map(this.mapRow);
    }
    async findByActivityType(activityType, unit, version, region) {
        const result = await this.pool.query(`SELECT *
       FROM emission_factors
       WHERE activity_type = $1
         AND unit = $2
         AND version = $3
         AND region = $4
         AND deleted_at IS NULL
         AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
         AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
       LIMIT 1`, [activityType, unit, version, region]);
        if (result.rowCount === 0) {
            return null;
        }
        return this.mapRow(result.rows[0]);
    }
    async getLatestVersion(region) {
        const result = await this.pool.query(`SELECT version
       FROM emission_factors
       WHERE region = $1
         AND deleted_at IS NULL
       ORDER BY version DESC
       LIMIT 1`, [region]);
        if (result.rowCount === 0) {
            return null;
        }
        return result.rows[0].version;
    }
    getCategoryPattern(category) {
        switch (category) {
            case 'energy':
                return 'energy%';
            case 'fuel':
                return 'fuel%';
            case 'transport':
                return 'transport%';
            case 'flights':
                return 'flight%';
            case 'scope1':
            case 'scope2':
            case 'scope3':
                // These categories can use multiple activity types
                return '%';
            default:
                return '%';
        }
    }
    mapRow(row) {
        return {
            id: row.id,
            activity_type: row.activity_type,
            unit: row.unit,
            factor_value: parseFloat(row.factor_value),
            factor_unit: row.factor_unit,
            source: row.source,
            valid_from: row.valid_from,
            valid_to: row.valid_to,
            region: row.region,
            version: row.version,
            metadata_json: row.metadata_json,
            created_at: row.created_at,
            updated_at: row.updated_at,
            deleted_at: row.deleted_at
        };
    }
}
