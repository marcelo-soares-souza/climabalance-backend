import { Area } from '../entities/area';
import { AreaStatus } from '../value-objects/area-status';
import { Biome } from '../value-objects/biome';

export interface AreaFilters {
  status?: AreaStatus;
  ownerUserId?: string;
  biome?: Biome;
  onlyActive?: boolean;
  onlyWithCapacity?: boolean;
  limit?: number;
  offset?: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Area Repository Interface
 * Port for area persistence operations
 */
export interface AreaRepository {
  /**
   * Save a new area
   */
  save(area: Area, client?: any): Promise<void>;

  /**
   * Find area by ID
   */
  findById(id: string, client?: any): Promise<Area | null>;

  /**
   * Find areas by owner
   */
  findByOwnerId(ownerUserId: string, client?: any): Promise<Area[]>;

  /**
   * Find all areas with filters
   */
  findAll(filters?: AreaFilters, client?: any): Promise<Area[]>;

  /**
   * Find active areas with available capacity (for map)
   */
  findActiveWithCapacity(filters?: { biome?: Biome }, client?: any): Promise<Area[]>;

  /**
   * Find areas within a bounding box
   */
  findWithinBounds(bounds: BoundingBox, client?: any): Promise<Area[]>;

  /**
   * Find nearest areas to a location
   */
  findNearest(
    latitude: number,
    longitude: number,
    limit?: number,
    client?: any
  ): Promise<Area[]>;

  /**
   * Update an existing area
   */
  update(area: Area, client?: any): Promise<void>;

  /**
   * Soft delete an area
   */
  delete(id: string, client?: any): Promise<void>;

  /**
   * Check if area exists
   */
  exists(id: string, client?: any): Promise<boolean>;

  /**
   * Count areas with filters
   */
  count(filters?: AreaFilters, client?: any): Promise<number>;

  /**
   * Get global platform stats
   */
  getGlobalStats(): Promise<{ totalAreas: number; totalTreesPlanted: number; totalCO2Captured: number }>;
}
