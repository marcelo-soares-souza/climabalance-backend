import { TreePlantingRepository } from '../../domain/areas/repositories/tree-planting-repository';

export type PlantedTreeItem = {
  id: string;
  latitude: number;
  longitude: number;
  plantedAt: string;
};

export async function getPlantedTrees(
  deps: { treePlantingRepository: TreePlantingRepository },
  areaId: string,
): Promise<PlantedTreeItem[]> {
  const trees = await deps.treePlantingRepository.findByAreaId(areaId);
  return trees.map((t) => ({
    id: t.id,
    latitude: t.latitude,
    longitude: t.longitude,
    plantedAt: t.createdAt.toISOString(),
  }));
}
