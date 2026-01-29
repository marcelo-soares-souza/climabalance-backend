import { Client } from 'pg';
import { logger } from '../shared/utils/logger';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const adminDb = process.env.DATABASE_ADMIN_DB ?? 'postgres';
const parsed = new URL(databaseUrl);
const dbName = parsed.pathname.replace('/', '');
if (!dbName) {
  throw new Error('DATABASE_URL must include a database name');
}

if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
  throw new Error('Database name must be alphanumeric or underscore');
}

const adminUrl = new URL(databaseUrl);
adminUrl.pathname = `/${adminDb}`;

const client = new Client({ connectionString: adminUrl.toString() });

try {
  await client.connect();
  logger.info('db.create.start', { database: dbName });
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (result.rowCount && result.rowCount > 0) {
    logger.warn('db.create.exists', { database: dbName });
  } else {
    await client.query(`CREATE DATABASE ${dbName}`);
    logger.info('db.create.created', { database: dbName });
  }
} catch (error) {
  logger.error('db.create.error', { error: error instanceof Error ? error.message : 'unknown' });
  throw error;
} finally {
  await client.end();
}
