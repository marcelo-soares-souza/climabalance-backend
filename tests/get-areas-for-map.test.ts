import { describe, expect, test } from 'bun:test';
import { getAreasForMap } from '../src/application/areas/get-areas-for-map';
import { Area } from '../src/domain/areas/entities/area';
import { AreaStatus } from '../src/domain/areas/value-objects/area-status';
import { CarbonCapacity } from '../src/domain/areas/value-objects/carbon-capacity';
import { Location } from '../src/domain/areas/value-objects/location';

class RecordingAreaRepository {
  findAllFilters: Record<string, unknown> | undefined;

  constructor(private readonly areas: Area[]) {}

  async findAll(filters?: Record<string, unknown>): Promise<Area[]> {
    this.findAllFilters = filters;
    return this.areas.filter((area) => {
      if (filters?.onlyActive && !area.isActive()) return false;
      if (filters?.biome && area.biome?.toString() !== String(filters.biome)) return false;
      return true;
    });
  }

  async findActiveWithCapacity(): Promise<Area[]> {
    throw new Error('should_not_be_called');
  }
}

const emptyMediaRepository = {
  async listByAreaIds(_areaIds: string[]): Promise<any[]> {
    return [];
  },
};

const emptyTreePlantingRepository = {
  async countByAreaId(_areaId: string): Promise<number> {
    return 0;
  },
  async countByAreaIds(_areaIds: string[]): Promise<Map<string, number>> {
    return new Map(_areaIds.map((id) => [id, 0]));
  },
  async sumCompensatedTreeCountByAreaIds(_areaIds: string[]): Promise<Map<string, number>> {
    return new Map(_areaIds.map((id) => [id, 0]));
  },
};

function makeArea(input: {
  id: string;
  status: AreaStatus;
  totalCapacityTCO2e?: number;
  committedTCO2e?: number;
  tCO2ePerTreePerYear?: number;
  pricePerTree?: number;
  defaultHorizonYears?: number;
}): Area {
  return new Area({
    id: input.id,
    ownerUserId: 'producer-1',
    name: input.id,
    location: new Location(-15.7939, -47.8828),
    status: input.status,
    carbonCapacity:
      input.totalCapacityTCO2e != null
        ? new CarbonCapacity(input.totalCapacityTCO2e, input.committedTCO2e ?? 0)
        : undefined,
    tCO2ePerTreePerYear: input.tCO2ePerTreePerYear,
    pricePerTree: input.pricePerTree,
    defaultHorizonYears: input.defaultHorizonYears,
    createdAt: new Date('2026-02-07T12:00:00Z'),
    updatedAt: new Date('2026-02-07T12:00:00Z'),
  });
}

describe('getAreasForMap', () => {
  test('returns active areas even when available capacity is zero or negative', async () => {
    const overCommittedArea = makeArea({
      id: 'area-overcommitted',
      status: AreaStatus.ACTIVE,
      totalCapacityTCO2e: 5,
      committedTCO2e: 8,
      tCO2ePerTreePerYear: 0.025,
      pricePerTree: 15,
      defaultHorizonYears: 20,
    });
    const zeroCapacityArea = makeArea({
      id: 'area-without-capacity',
      status: AreaStatus.ACTIVE,
    });
    const suspendedArea = makeArea({
      id: 'area-suspended',
      status: AreaStatus.SUSPENDED,
      totalCapacityTCO2e: 20,
      committedTCO2e: 1,
    });

    const areaRepository = new RecordingAreaRepository([
      overCommittedArea,
      zeroCapacityArea,
      suspendedArea,
    ]);

    const result = await getAreasForMap({
      areaRepository: areaRepository as any,
      areaMediaRepository: emptyMediaRepository as any,
      treePlantingRepository: emptyTreePlantingRepository as any,
    });

    expect(result.map((item) => item.id)).toEqual([
      'area-overcommitted',
      'area-without-capacity',
    ]);
    expect(result[0]?.availableTCO2e).toBe(-3);
    expect(result[0]?.tCO2ePerTreePerYear).toBe(0.025);
    expect(result[0]?.estimatedKgCO2PerTreePerYear).toBe(25);
    expect(result[0]?.pricePerTree).toBe(15);
    expect(result[0]?.defaultHorizonYears).toBe(20);
    expect(result[1]?.availableTCO2e).toBe(0);
  });
});
