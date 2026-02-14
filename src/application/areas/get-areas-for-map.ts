import { AreaRepository } from '../../domain/areas/repositories/area-repository';
import { Biome } from '../../domain/areas/value-objects/biome';

export interface AreaMapItem {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  biome?: string;
  state?: string;
  city?: string;
  status: string;
  totalCapacityTCO2e: number;
  committedTCO2e: number;
  availableTCO2e: number;
  tCO2ePerTreePerYear?: number;
}

export interface GetAreasForMapDeps {
  areaRepository: AreaRepository;
}

export async function getAreasForMap(
  deps: GetAreasForMapDeps,
  filters?: { biome?: string }
): Promise<AreaMapItem[]> {
  const repoFilters: any = {};

  if (filters?.biome) {
    repoFilters.biome = Biome.fromString(filters.biome);
  }

  const areas = await deps.areaRepository.findActiveWithCapacity(repoFilters);

  return areas.map((area) => ({
    id: area.id,
    name: area.name,
    latitude: area.location.latitude,
    longitude: area.location.longitude,
    biome: area.biome?.toString(),
    state: area.state,
    city: area.city,
    status: area.status.toString(),
    totalCapacityTCO2e: area.carbonCapacity?.totalCapacityTCO2e || 0,
    committedTCO2e: area.carbonCapacity?.committedTCO2e || 0,
    availableTCO2e: area.carbonCapacity?.availableTCO2e || 0,
    tCO2ePerTreePerYear: area.tCO2ePerTreePerYear,
  }));
}
