import { pgPool } from '../infrastructure/persistence/postgres/pg-client';
import { uuidv7 } from '../shared/utils/id';
import { logger } from '../shared/utils/logger';

type SeedRole = {
  key: string;
  name: string;
  description: string;
};

const seedRoles: SeedRole[] = [
  { key: 'administrator', name: 'Administrator', description: 'System administrator with full access.' },
  { key: 'analyst', name: 'Analyst', description: 'User who can audit and approve areas.' },
  { key: 'producer', name: 'Producer', description: 'User who can create and manage areas.' },
  { key: 'individual', name: 'Individual', description: 'Individual user profile.' },
  { key: 'legal_entity', name: 'Legal entity', description: 'Company or organization profile.' }
];

const now = new Date();
const client = await pgPool.connect();

try {
  await client.query('BEGIN');
  logger.info('seed.roles.start', { count: seedRoles.length });

  for (const role of seedRoles) {
    const existing = await client.query(
      `SELECT id, deleted_at FROM roles WHERE role_key = $1`,
      [role.key]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const deletedAt = existing.rows[0].deleted_at as Date | null;
      if (deletedAt) {
        await client.query(
          `UPDATE roles
           SET deleted_at = NULL,
               updated_at = $2
           WHERE role_key = $1`,
          [role.key, now]
        );
        logger.info('seed.roles.reactivated', { role_key: role.key });
      } else {
        logger.info('seed.roles.exists', { role_key: role.key });
      }
      continue;
    }

    await client.query(
      `INSERT INTO roles (id, role_key, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [uuidv7(), role.key, role.name, role.description, now]
    );
    logger.info('seed.roles.created', { role_key: role.key });
  }

  await client.query('COMMIT');
  logger.info('seed.roles.completed');
} catch (error) {
  await client.query('ROLLBACK');
  logger.error('seed.roles.failed', { error: error instanceof Error ? error.message : 'unknown' });
  throw error;
} finally {
  client.release();
  await pgPool.end();
}
