import type { FootprintBreakdown } from "../entities/footprint-breakdown";

/**
 * Footprint Breakdown Repository interface
 */
export interface FootprintBreakdownRepository {
  /**
   * Save a breakdown entry
   */
  save(breakdown: FootprintBreakdown, client?: any): Promise<void>;

  /**
   * Save multiple breakdown entries in batch
   */
  saveMany(breakdowns: FootprintBreakdown[], client?: any): Promise<void>;

  /**
   * Find breakdown by calculation ID
   */
  findByCalculationId(calculationId: string): Promise<FootprintBreakdown[]>;

  /**
   * Delete all breakdown entries for a calculation
   */
  deleteByCalculationId(calculationId: string, client?: any): Promise<void>;
}
