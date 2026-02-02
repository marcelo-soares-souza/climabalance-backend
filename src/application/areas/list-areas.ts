import { AreaRepository, AreaFilters } from '../../domain/areas/repositories/area-repository';
import { AreaStatus } from '../../domain/areas/value-objects/area-status';
import { Biome } from '../../domain/areas/value-objects/biome';

export interface ListAreasRequest {
  userId?: string;
  status?: string;
  biome?: string;
  ownerUserId?: string;
  limit?: number;
  offset?: number;
}

export interface AreaListItem {
  id: string;
  ownerUserId: string;
  name: string;
  latitude: number;
  longitude: number;
  biome?: string;
  status: string;
  availableTCO2e?: number;
  createdAt: Date;
}

export interface ListAreasDeps {
  areaRepository: AreaRepository;
}

export async function listAreas(
  deps: ListAreasDeps,
  request: ListAreasRequest
): Promise<AreaListItem[]> {
  const filters: AreaFilters = {
    limit: request.limit,
    offset: request.offset,
  };

  if (request.status) {
    filters.status = AreaStatus.fromString(request.status);
  }

  if (request.biome) {
    filters.biome = Biome.fromString(request.biome);
  }

  if (request.ownerUserId) {
    filters.ownerUserId = request.ownerUserId;
  }

  const areas = await deps.areaRepository.findAll(filters);

  return areas.map((area) => ({
    id: area.id,
    ownerUserId: area.ownerUserId,
    name: area.name,
    latitude: area.location.latitude,
    longitude: area.location.longitude,
    biome: area.biome?.toString(),
    status: area.status.toString(),
    availableTCO2e: area.carbonCapacity?.availableTCO2e,
    createdAt: area.createdAt,
  }));
}
