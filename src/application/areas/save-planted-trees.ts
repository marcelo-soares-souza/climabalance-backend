import { TreePlantingRepository } from "../../domain/areas/repositories/tree-planting-repository";

export type TreePointInput = {
  latitude: number;
  longitude: number;
};

export type SavePlantedTreesDeps = {
  treePlantingRepository: TreePlantingRepository;
  idGenerator: { generate: () => string };
  clock: { now: () => Date };
};

export async function savePlantedTrees(
  deps: SavePlantedTreesDeps,
  input: {
    areaId: string;
    plantedByUserId: string;
    points: TreePointInput[];
  },
): Promise<void> {
  if (input.points.length === 0) return;

  const now = deps.clock.now();
  const records = input.points.map((p) => ({
    id: deps.idGenerator.generate(),
    areaId: input.areaId,
    plantedByUserId: input.plantedByUserId,
    latitude: p.latitude,
    longitude: p.longitude,
    createdAt: now,
    updatedAt: now,
  }));

  await deps.treePlantingRepository.saveBatch(records);
}
