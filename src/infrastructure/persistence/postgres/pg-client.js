import { Pool } from 'pg';
import { env } from '../../../shared/utils/env';
import { logger } from '../../../shared/utils/logger';
export const pgPool = new Pool({
    connectionString: env.databaseUrl
});
pgPool.on('error', (error) => {
    logger.error('database.pool_error', {
        message: error.message,
        code: error.code,
        stack: error.stack
    });
});
pgPool.on('connect', () => {
    logger.debug('database.client_connected');
});
pgPool.on('acquire', () => {
    logger.debug('database.client_acquired');
});
pgPool.on('remove', () => {
    logger.debug('database.client_removed');
});
