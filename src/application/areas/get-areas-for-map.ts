import { AreaRepository } from '../../domain/areas/repositories/area-repository';
import { AreaMediaRepository } from '../../domain/areas/repositories/area-media-repository';
import { TreePlantingRepository } from '../../domain/areas/repositories/tree-planting-repository';
import { Biome } from '../../domain/areas/value-objects/biome';

export interface AreaMapItem {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  biome?: string;
  state?: string;
  city?: string;
  description?: string;
  status: string;
  totalCapacityTCO2e: number;
  committedTCO2e: number;
  availableTCO2e: number;
  tCO2ePerTreePerYear?: number;
  estimatedKgCO2PerTreePerYear?: number;
  pricePerTree?: number;
  defaultHorizonYears?: number;
  committedTreesCount?: number;
  plantedTreesCount?: number;
  thumbnailUrl?: string;
}

export interface GetAreasForMapDeps {
  areaRepository: AreaRepository;
  areaMediaRepository: AreaMediaRepository;
  treePlantingRepository: TreePlantingRepository;
}

export async function getAreasForMap(
  deps: GetAreasForMapDeps,
  filters?: { biome?: string }
): Promise<AreaMapItem[]> {
  const repoFilters: any = { onlyActive: true };

  if (filters?.biome) {
    repoFilters.biome = Biome.fromString(filters.biome);
  }

  const areas = await deps.areaRepository.findAll(repoFilters);

  const areaIds = areas.map((a) => a.id);

  const [allMedia, plantedCountByAreaId] = await Promise.all([
    areaIds.length > 0
      ? deps.areaMediaRepository.listByAreaIds(areaIds)
      : Promise.resolve([]),
    areaIds.length > 0
      ? deps.treePlantingRepository.countByAreaIds(areaIds)
      : Promise.resolve(new Map<string, number>()),
  ]);

  const thumbnailByAreaId = new Map<string, string>();
  const usedAreas = new Set<string>();
  const shuffled = allMedia.sort(() => Math.random() - 0.5);
  for (const media of shuffled) {
    if (!usedAreas.has(media.areaId)) {
      usedAreas.add(media.areaId);
      thumbnailByAreaId.set(media.areaId, `/api/v1/areas/media/${media.id}/file`);
    }
  }

  return areas.map((area) => ({
    id: area.id,
    name: area.name,
    latitude: area.location.latitude,
    longitude: area.location.longitude,
    biome: area.biome?.toString(),
    state: area.state,
    city: area.city,
    description: area.description,
    status: area.status.toString(),
    totalCapacityTCO2e: area.carbonCapacity?.totalCapacityTCO2e || 0,
    committedTCO2e: area.carbonCapacity?.committedTCO2e || 0,
    availableTCO2e: area.carbonCapacity?.availableTCO2e || 0,
    tCO2ePerTreePerYear: area.tCO2ePerTreePerYear,
    estimatedKgCO2PerTreePerYear:
      area.tCO2ePerTreePerYear !== undefined
        ? area.tCO2ePerTreePerYear * 1000
        : undefined,
    pricePerTree: area.pricePerTree,
    defaultHorizonYears: area.defaultHorizonYears,
    committedTreesCount:
      area.carbonCapacity?.committedTCO2e &&
      area.tCO2ePerTreePerYear &&
      area.defaultHorizonYears
        ? Math.floor(
            area.carbonCapacity.committedTCO2e /
              (area.tCO2ePerTreePerYear * area.defaultHorizonYears)
          )
        : undefined,
    plantedTreesCount: plantedCountByAreaId.get(area.id) || 0,
    thumbnailUrl: thumbnailByAreaId.get(area.id) || undefined,
  }));
}
