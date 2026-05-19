import { TreePlantingRepository } from "../../domain/areas/repositories/tree-planting-repository";

export async function deletePlantedTrees(
  deps: { treePlantingRepository: TreePlantingRepository },
  areaId: string,
): Promise<void> {
  await deps.treePlantingRepository.deleteByAreaId(areaId);
}
