import type { Pool, PoolClient } from 'pg';
import type { UnitOfWork, Transaction } from '../unit-of-work';
import { PostgresUserRepository } from './user-repository';
import { PostgresEmailConfirmationRepository } from './email-confirmation-repository';
import { PostgresPasswordResetRepository } from './password-reset-repository';
import { logger } from '../../../shared/utils/logger';

class PostgresTransaction implements Transaction {
  constructor(private client: PoolClient) {}

  getUserRepository() {
    return new PostgresUserRepository(this.client);
  }

  getEmailConfirmationRepository() {
    return new PostgresEmailConfirmationRepository(this.client);
  }

  getPasswordResetRepository() {
    return new PostgresPasswordResetRepository(this.client);
  }
}

export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private pool: Pool) {}

  async execute<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    let client: PoolClient | null = null;

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
    } catch (error) {
      if (client) {
        logger.warn('transaction.rollback', {
          error: error instanceof Error ? error.message : String(error)
        });
        await client.query('ROLLBACK');
      }

      logger.error('transaction.failed', {
        message: error instanceof Error ? error.message : String(error),
        code: error instanceof Error && 'code' in error ? (error as any).code : undefined,
        stack: error instanceof Error ? error.stack : undefined
      });

      throw error;
    } finally {
      if (client) {
        client.release();
        logger.debug('transaction.client_released');
      }
    }
  }
}

