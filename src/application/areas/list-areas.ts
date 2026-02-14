import { AreaRepository, AreaFilters } from '../../domain/areas/repositories/area-repository';
import { AreaStatus } from '../../domain/areas/value-objects/area-status';
import { Biome } from '../../domain/areas/value-objects/biome';

export interface ListAreasRequest {
  userId?: string;
  roles?: string[];
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
  description?: string;
  latitude: number;
  longitude: number;
  biome?: string;
  state?: string;
  city?: string;
  status: string;
  totalCapacityTCO2e?: number;
  committedTCO2e?: number;
  availableTCO2e?: number;
  tCO2ePerTreePerYear?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListAreasDeps {
  areaRepository: AreaRepository;
}

const PRIVILEGED_ROLES = ['administrator', 'analyst'];

function isPrivileged(roles?: string[]): boolean {
  return roles?.some((r) => PRIVILEGED_ROLES.includes(r)) ?? false;
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
  } else if (!isPrivileged(request.roles) && request.userId) {
    filters.ownerUserId = request.userId;
  }

  const areas = await deps.areaRepository.findAll(filters);

  return areas.map((area) => ({
    id: area.id,
    ownerUserId: area.ownerUserId,
    name: area.name,
    description: area.description,
    latitude: area.location.latitude,
    longitude: area.location.longitude,
    biome: area.biome?.toString(),
    state: area.state,
    city: area.city,
    status: area.status.toString(),
    totalCapacityTCO2e: area.carbonCapacity?.totalCapacityTCO2e,
    committedTCO2e: area.carbonCapacity?.committedTCO2e,
    availableTCO2e: area.carbonCapacity?.availableTCO2e,
    tCO2ePerTreePerYear: area.tCO2ePerTreePerYear,
    createdAt: area.createdAt,
    updatedAt: area.updatedAt,
  }));
}
