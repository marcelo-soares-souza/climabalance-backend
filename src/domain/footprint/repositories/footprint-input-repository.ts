import type { FootprintInput } from '../entities/footprint-input';

/**
 * Footprint Input Repository interface
 */
export interface FootprintInputRepository {
  /**
   * Save a footprint input
   */
  save(input: FootprintInput, client?: any): Promise<void>;

  /**
   * Save multiple inputs in batch
   */
  saveMany(inputs: FootprintInput[], client?: any): Promise<void>;

  /**
   * Find inputs by calculation ID
   */
  findByCalculationId(calculationId: string): Promise<FootprintInput[]>;

  /**
   * Delete all inputs for a calculation
   */
  deleteByCalculationId(calculationId: string, client?: any): Promise<void>;
}
