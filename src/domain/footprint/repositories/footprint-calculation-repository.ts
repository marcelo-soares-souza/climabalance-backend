import type { FootprintCalculation } from '../entities/footprint-calculation';
import type { ProfileType } from '../value-objects/profile-type';
import type { CalculationStatus } from '../value-objects/calculation-status';

/**
 * Footprint Calculation Repository interface
 */
export interface FootprintCalculationRepository {
  /**
   * Save a new calculation
   */
  save(calculation: FootprintCalculation, client?: any): Promise<void>;

  /**
   * Update an existing calculation
   */
  update(calculation: FootprintCalculation, client?: any): Promise<void>;

  /**
   * Find calculation by ID
   */
  findById(id: string): Promise<FootprintCalculation | null>;

  /**
   * Find calculations by user ID
   */
  findByUserId(
    userId: string,
    filters?: {
      status?: CalculationStatus;
      profile_type?: ProfileType;
      limit?: number;
      offset?: number;
    }
  ): Promise<FootprintCalculation[]>;

  /**
   * Soft delete a calculation
   */
  delete(id: string, client?: any): Promise<void>;
}
