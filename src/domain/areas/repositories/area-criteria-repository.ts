import { AreaCriterion } from '../entities/area-criterion';

/**
 * Area Criteria Repository Interface
 * Port for area criteria persistence operations
 */
export interface AreaCriteriaRepository {
  /**
   * Save a single criterion
   */
  save(criterion: AreaCriterion, client?: any): Promise<void>;

  /**
   * Save multiple criteria (batch operation)
   */
  saveMany(criteria: AreaCriterion[], client?: any): Promise<void>;

  /**
   * Find all criteria for an area
   */
  findByAreaId(areaId: string, client?: any): Promise<AreaCriterion[]>;

  /**
   * Delete all criteria for an area
   */
  deleteByAreaId(areaId: string, client?: any): Promise<void>;

  /**
   * Count criteria for an area
   */
  countByAreaId(areaId: string, client?: any): Promise<number>;

  /**
   * Check if all criteria for an area are met
   */
  areAllMetForArea(areaId: string, client?: any): Promise<boolean>;
}
