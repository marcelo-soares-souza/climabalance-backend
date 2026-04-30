import type { AreaRepository } from '../../domain/areas/repositories/area-repository';

export type GlobalStats = {
  totalAreas: number;
  totalTreesPlanted: number;
  totalCO2Captured: number;
};

export async function getGlobalStats(deps: {
  areaRepository: AreaRepository;
}): Promise<GlobalStats> {
  return deps.areaRepository.getGlobalStats();
}
