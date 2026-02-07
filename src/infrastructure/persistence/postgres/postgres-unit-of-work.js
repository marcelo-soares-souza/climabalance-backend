import { PostgresUserRepository } from './user-repository';
import { PostgresEmailConfirmationRepository } from './email-confirmation-repository';
import { PostgresPasswordResetRepository } from './password-reset-repository';
import { PostgresAuditLogRepository } from './audit-log-repository';
import { PostgresFootprintCalculationRepository } from './footprint-calculation-repository';
import { PostgresFootprintInputRepository } from './footprint-input-repository';
import { PostgresFootprintBreakdownRepository } from './footprint-breakdown-repository';
import { PostgresCompensationProjectionRepository } from './compensation-projection-repository';
import { logger } from '../../../shared/utils/logger';
class PostgresTransaction {
    client;
    constructor(client) {
        this.client = client;
    }
    getUserRepository() {
        return new PostgresUserRepository(this.client);
    }
    getEmailConfirmationRepository() {
        return new PostgresEmailConfirmationRepository(this.client);
    }
    getPasswordResetRepository() {
        return new PostgresPasswordResetRepository(this.client);
    }
    getAuditLogRepository() {
        return new PostgresAuditLogRepository(this.client);
    }
    getFootprintCalculationRepository() {
        return new PostgresFootprintCalculationRepository(this.client);
    }
    getFootprintInputRepository() {
        return new PostgresFootprintInputRepository(this.client);
    }
    getFootprintBreakdownRepository() {
        return new PostgresFootprintBreakdownRepository(this.client);
    }
    getCompensationProjectionRepository() {
        return new PostgresCompensationProjectionRepository(this.client);
    }
}
export class PostgresUnitOfWork {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async execute(work) {
        let client = null;
        try {
            logger.debug('transaction.acquiring_client');
            client = await this.pool.connect();
            logger.debug('transaction.client_acquired');
            logger.debug('transaction.begin');
            await client.query('BEGIN');
            const transaction = new PostgresTransaction(client);
            const result = await work(transaction);
            logger.debug('transaction.commit');
            await client.query('COMMIT');
            logger.info('transaction.completed');
            return result;
        }
        catch (error) {
            if (client) {
                logger.warn('transaction.rollback', {
                    error: error instanceof Error ? error.message : String(error)
                });
                await client.query('ROLLBACK');
            }
            logger.error('transaction.failed', {
                message: error instanceof Error ? error.message : String(error),
                code: error instanceof Error && 'code' in error ? error.code : undefined,
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
        finally {
            if (client) {
                client.release();
                logger.debug('transaction.client_released');
            }
        }
    }
}
