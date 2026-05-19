import type { Pool, PoolClient } from "pg";
import type { UnitOfWork, Transaction } from "../unit-of-work";
import { PostgresUserRepository } from "./user-repository";
import { PostgresConsentRepository } from "./consent-repository";
import { PostgresEmailConfirmationRepository } from "./email-confirmation-repository";
import { PostgresPasswordResetRepository } from "./password-reset-repository";
import { PostgresAuditLogRepository } from "./audit-log-repository";
import { PostgresFootprintCalculationRepository } from "./footprint-calculation-repository";
import { PostgresFootprintInputRepository } from "./footprint-input-repository";
import { PostgresFootprintBreakdownRepository } from "./footprint-breakdown-repository";
import { PostgresCompensationProjectionRepository } from "./compensation-projection-repository";
import { logger, serializeError } from "../../../shared/utils/logger";

class PostgresTransaction implements Transaction {
  constructor(private client: PoolClient) {}

  getUserRepository() {
    return new PostgresUserRepository(this.client);
  }

  getConsentRepository() {
    return new PostgresConsentRepository(this.client);
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

export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private pool: Pool) {}

  async execute<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    let client: PoolClient | null = null;
    const startedAt = Date.now();

    try {
      logger.debug("database.transaction.client_acquiring");
      client = await this.pool.connect();
      logger.debug("database.transaction.client_acquired");

      logger.debug("database.transaction.begin");
      await client.query("BEGIN");

      const transaction = new PostgresTransaction(client);
      const result = await work(transaction);

      logger.debug("database.transaction.commit");
      await client.query("COMMIT");
      logger.info("database.transaction.completed", {
        duration_ms: Date.now() - startedAt,
      });

      return result;
    } catch (error) {
      if (client) {
        logger.warn("database.transaction.rollback", {
          duration_ms: Date.now() - startedAt,
          error: serializeError(error),
        });
        await client.query("ROLLBACK");
      }

      logger.error("database.transaction.failed", {
        duration_ms: Date.now() - startedAt,
        error: serializeError(error),
      });

      throw error;
    } finally {
      if (client) {
        client.release();
        logger.debug("database.transaction.client_released");
      }
    }
  }
}
