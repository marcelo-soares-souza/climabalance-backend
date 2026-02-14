import { AreaRepository } from '../../domain/areas/repositories/area-repository';
import { Location } from '../../domain/areas/value-objects/location';
import { Biome } from '../../domain/areas/value-objects/biome';
import { AreaStatus } from '../../domain/areas/value-objects/area-status';

export interface UpdateAreaRequest {
  userId: string;
  areaId: string;
  isAdmin?: boolean;
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  biome?: string;
  state?: string;
  city?: string;
  totalCapacityTCO2e?: number;
  tCO2ePerTreePerYear?: number;
  status?: string;
}

export interface UpdateAreaDeps {
  areaRepository: AreaRepository;
}

export async function updateArea(
  deps: UpdateAreaDeps,
  request: UpdateAreaRequest
): Promise<void> {
  const isAdmin = request.isAdmin ?? false;
  const area = await deps.areaRepository.findById(request.areaId);

  if (!area) {
    throw new Error('Area not found');
  }

  if (!area.canBeEditedBy(request.userId, isAdmin)) {
    throw new Error('User cannot edit this area');
  }

  const updates: any = {};

  if (request.name !== undefined) updates.name = request.name;
  if (request.description !== undefined) updates.description = request.description;
  if (request.state !== undefined) updates.state = request.state;
  if (request.city !== undefined) updates.city = request.city;
  if (request.totalCapacityTCO2e !== undefined)
    updates.totalCapacityTCO2e = request.totalCapacityTCO2e;
  if (request.tCO2ePerTreePerYear !== undefined)
    updates.tCO2ePerTreePerYear = request.tCO2ePerTreePerYear;

  if (request.latitude !== undefined && request.longitude !== undefined) {
    updates.location = new Location(request.latitude, request.longitude);
  }

  if (request.biome !== undefined) {
    updates.biome = Biome.fromString(request.biome);
  }

  area.update(updates, { forceEdit: isAdmin });

  if (request.status !== undefined) {
    if (!isAdmin) {
      throw new Error('Only admin can update area status');
    }
    area.status = AreaStatus.fromString(request.status);
    area.updatedAt = new Date();
  }

  await deps.areaRepository.update(area);
}
