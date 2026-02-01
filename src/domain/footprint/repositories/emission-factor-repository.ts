import type { EmissionFactor } from '../entities/emission-factor';
import type { FootprintCategory } from '../value-objects/category';

/**
 * Emission Factor Repository interface
 */
export interface EmissionFactorRepository {
  /**
   * Find emission factors by version and region
   */
  findByVersionAndRegion(version: string, region: string): Promise<EmissionFactor[]>;

  /**
   * Find emission factors by category
   */
  findByCategory(category: FootprintCategory, version: string, region: string): Promise<EmissionFactor[]>;

  /**
   * Find a specific emission factor by activity type
   */
  findByActivityType(
    activityType: string,
    unit: string,
    version: string,
    region: string
  ): Promise<EmissionFactor | null>;

  /**
   * Get the latest version identifier
   */
  getLatestVersion(region: string): Promise<string | null>;
}
