import { TreePlantingRepository } from "../../domain/areas/repositories/tree-planting-repository";

export type PendingTreeCount = {
  totalCompensated: number;
  totalPlanted: number;
  pending: number;
};

export async function getPendingTreeCount(
  deps: { treePlantingRepository: TreePlantingRepository },
  areaId: string,
): Promise<PendingTreeCount> {
  const [totalPlanted, totalCompensated] = await Promise.all([
    deps.treePlantingRepository.countByAreaId(areaId),
    deps.treePlantingRepository.sumCompensatedTreeCountByAreaId(areaId),
  ]);

  return {
    totalCompensated,
    totalPlanted,
    pending: Math.max(totalCompensated - totalPlanted, 0),
  };
}
