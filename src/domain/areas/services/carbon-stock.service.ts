import { AreaRepository } from '../repositories/area-repository';

export interface CarbonStockServiceDeps {
  areaRepository: AreaRepository;
}

/**
 * Carbon Stock Domain Service
 * Manages carbon capacity reservations and releases
 */
export class CarbonStockService {
  constructor(private deps: CarbonStockServiceDeps) {}

  /**
   * Reserve carbon stock for a compensation
   */
  async reserveStock(
    areaId: string,
    tCO2e: number,
    client?: any
  ): Promise<void> {
    if (tCO2e <= 0) {
      throw new Error('Reserve amount must be positive');
    }

    const area = await this.deps.areaRepository.findById(areaId, client);

    if (!area) {
      throw new Error('Area not found');
    }

    // Use domain entity business rule
    area.reserveCapacity(tCO2e);

    await this.deps.areaRepository.update(area, client);
  }

  /**
   * Release reserved stock (if compensation cancelled)
   */
  async releaseStock(
    areaId: string,
    tCO2e: number,
    client?: any
  ): Promise<void> {
    if (tCO2e <= 0) {
      throw new Error('Release amount must be positive');
    }

    const area = await this.deps.areaRepository.findById(areaId, client);

    if (!area) {
      throw new Error('Area not found');
    }

    // Use domain entity business rule
    area.releaseCapacity(tCO2e);

    await this.deps.areaRepository.update(area, client);
  }

  /**
   * Get available capacity for an area
   */
  async getAvailableCapacity(areaId: string, client?: any): Promise<number> {
    const area = await this.deps.areaRepository.findById(areaId, client);

    if (!area) {
      throw new Error('Area not found');
    }

    if (!area.carbonCapacity) {
      return 0;
    }

    return area.carbonCapacity.availableTCO2e;
  }

  /**
   * Check if area has sufficient capacity
   */
  async hasSufficientCapacity(
    areaId: string,
    requiredTCO2e: number,
    client?: any
  ): Promise<boolean> {
    const area = await this.deps.areaRepository.findById(areaId, client);

    if (!area) {
      return false;
    }

    if (!area.carbonCapacity) {
      return false;
    }

    return area.carbonCapacity.canReserve(requiredTCO2e);
  }
}
