import type { CompensationProjection } from "../entities/compensation-projection";

/**
 * Compensation Projection Repository interface
 */
export interface CompensationProjectionRepository {
  /**
   * Save a projection
   */
  save(projection: CompensationProjection, client?: any): Promise<void>;

  /**
   * Find projection by calculation ID
   */
  findByCalculationId(
    calculationId: string,
  ): Promise<CompensationProjection | null>;

  /**
   * Find projections by area ID
   */
  findByAreaId(areaId: string): Promise<CompensationProjection[]>;
}
