import type { UserRepository } from '../../domain/user/user-repository';
import type { EmailConfirmationRepository } from '../../domain/user/email-confirmation-repository';
import type { PasswordResetRepository } from '../../domain/user/password-reset-repository';
import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { FootprintCalculationRepository } from '../../domain/footprint/repositories/footprint-calculation-repository';
import type { FootprintInputRepository } from '../../domain/footprint/repositories/footprint-input-repository';
import type { FootprintBreakdownRepository } from '../../domain/footprint/repositories/footprint-breakdown-repository';
import type { CompensationProjectionRepository } from '../../domain/footprint/repositories/compensation-projection-repository';

/**
 * Transaction provides access to repositories within a database transaction.
 * All operations using these repositories will be atomic.
 */
export interface Transaction {
  getUserRepository(): UserRepository;
  getEmailConfirmationRepository(): EmailConfirmationRepository;
  getPasswordResetRepository(): PasswordResetRepository;
  getAuditLogRepository(): AuditLogRepository;
  getFootprintCalculationRepository(): FootprintCalculationRepository;
  getFootprintInputRepository(): FootprintInputRepository;
  getFootprintBreakdownRepository(): FootprintBreakdownRepository;
  getCompensationProjectionRepository(): CompensationProjectionRepository;
}

/**
 * Unit of Work pattern for managing database transactions.
 * Ensures all operations within a work function are atomic.
 */
export interface UnitOfWork {
  execute<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
}
