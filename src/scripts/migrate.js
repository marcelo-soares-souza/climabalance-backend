import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { pgPool } from '../infrastructure/persistence/postgres/pg-client';
import { sha256Hex } from '../shared/utils/crypto';
import { uuidv7 } from '../shared/utils/id';
import { logger } from '../shared/utils/logger';
const MIGRATIONS_TABLE = 'schema_migrations';
async function ensureMigrationsTable() {
    const check = await pgPool.query(`SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`, [MIGRATIONS_TABLE]);
    if (check.rowCount && check.rowCount > 0)
        return;
    await pgPool.query(`CREATE TABLE ${MIGRATIONS_TABLE} (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    )`);
}
async function readMigrations(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
        .map((entry) => entry.name)
        .sort();
    const migrations = [];
    for (const file of files) {
        const filePath = path.join(dir, file);
        const sql = await readFile(filePath, 'utf-8');
        const checksum = await sha256Hex(sql);
        migrations.push({ name: file, sql, checksum });
    }
    return migrations;
}
async function applyMigrations() {
    const migrationsDir = path.join(process.cwd(), 'migrations');
    logger.info('migrations.start', { dir: migrationsDir });
    await ensureMigrationsTable();
    const migrations = await readMigrations(migrationsDir);
    for (const migration of migrations) {
        const result = await pgPool.query(`SELECT id, checksum FROM ${MIGRATIONS_TABLE} WHERE name = $1 AND deleted_at IS NULL`, [migration.name]);
        if (result.rowCount && result.rowCount > 0) {
            const existing = result.rows[0];
            if (existing.checksum !== migration.checksum) {
                logger.error('migrations.checksum_mismatch', { name: migration.name });
                throw new Error(`Migration checksum mismatch: ${migration.name}`);
            }
            continue;
        }
        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');
            await client.query(migration.sql);
            const now = new Date();
            await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (id, name, checksum, applied_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4, $4)`, [uuidv7(), migration.name, migration.checksum, now]);
            await client.query('COMMIT');
            logger.info('migrations.applied', { name: migration.name });
        }
        catch (error) {
            await client.query('ROLLBACK');
            logger.error('migrations.failed', { name: migration.name });
            throw error;
        }
        finally {
            client.release();
        }
    }
}
try {
    await applyMigrations();
    logger.info('migrations.completed');
    await pgPool.end();
}
catch (error) {
    logger.error('migrations.error', { error: error instanceof Error ? error.message : 'unknown' });
    await pgPool.end();
    process.exit(1);
}
