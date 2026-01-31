import type { UserRepository } from '../../domain/user/user-repository';
import type { EmailConfirmationRepository } from '../../domain/user/email-confirmation-repository';
import type { PasswordResetRepository } from '../../domain/user/password-reset-repository';

/**
 * Transaction provides access to repositories within a database transaction.
 * All operations using these repositories will be atomic.
 */
export interface Transaction {
  getUserRepository(): UserRepository;
  getEmailConfirmationRepository(): EmailConfirmationRepository;
  getPasswordResetRepository(): PasswordResetRepository;
}

/**
 * Unit of Work pattern for managing database transactions.
 * Ensures all operations within a work function are atomic.
 */
export interface UnitOfWork {
  execute<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
}
