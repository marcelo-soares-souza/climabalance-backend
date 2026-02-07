import { Pool } from 'pg';
import { env } from '../../../shared/utils/env';
import { logger } from '../../../shared/utils/logger';
export const pgPool = new Pool({
    connectionString: env.databaseUrl
});
pgPool.on('error', (error, client) => {
    logger.error('database.pool_error', {
        message: error.message,
        code: error.code,
        stack: error.stack
    });
});
pgPool.on('connect', (client) => {
    logger.debug('database.client_connected');
});
pgPool.on('acquire', (client) => {
    logger.debug('database.client_acquired');
});
pgPool.on('remove', (client) => {
    logger.debug('database.client_removed');
});
